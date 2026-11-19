import type {
  ApiResourceInfo,
  ClusterId,
  MetricsDataPoint,
  MetricsHistory,
  MetricsHistoryRequest,
  MetricsSeries,
} from "@shared/types";
import { buildApiPath, kubeRequest, errorMessage } from "./http";
import type { ClusterConnection } from "./session";

/**
 * Rolling metrics.k8s.io history.
 *
 * The Kubernetes metrics API only serves the current sample, so a graph needs
 * someone to remember the previous ones. mLens keeps a per-cluster ring buffer
 * in the main process: two LISTs every 30 seconds (PodMetrics + NodeMetrics),
 * 120 samples per series — one hour. Collection starts with the first Metrics
 * tab read and pauses after ten idle minutes, so ticked-over tabs and idle
 * clusters cost nothing. Nothing is persisted: this is live collection, not
 * Prometheus.
 */

const POLL_INTERVAL_MS = 30_000;
const HISTORY_CAPACITY = 120;
const IDLE_STOP_MS = 10 * 60_000;
/** A pod/node that disappears from the metrics API stops being sampled. */
const STALE_MS = 5 * 60_000;
const LIST_TIMEOUT_MS = 20_000;
/** Namespace-scoped RBAC fallback stays bounded. */
const MAX_FALLBACK_NAMESPACES = 12;

/** Kubernetes CPU quantity → millicores. */
function parseCpuMilli(value: unknown): number {
  if (typeof value === "number") return value * 1000;
  if (typeof value !== "string") return 0;
  const match = /^([0-9.]+)([a-zµ]*)$/i.exec(value.trim());
  if (!match) return 0;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return 0;
  switch (match[2]) {
    case "n":
      return amount / 1e6;
    case "u":
    case "µ":
      return amount / 1000;
    case "m":
      return amount;
    default:
      return amount * 1000;
  }
}

/** Kubernetes memory quantity → bytes. */
function parseMemoryBytes(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;
  const match = /^([0-9.]+)([A-Za-z]*)$/.exec(value.trim());
  if (!match) return 0;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return 0;
  const units: Record<string, number> = {
    "": 1,
    k: 1e3,
    K: 1e3,
    M: 1e6,
    G: 1e9,
    T: 1e12,
    P: 1e15,
    E: 1e18,
    Ki: 1024,
    Mi: 1024 ** 2,
    Gi: 1024 ** 3,
    Ti: 1024 ** 4,
    Pi: 1024 ** 5,
    Ei: 1024 ** 6,
  };
  return amount * (units[match[2]] ?? 1);
}

class Ring {
  private readonly points: MetricsDataPoint[] = [];

  constructor(private readonly capacity: number) {}

  add(point: MetricsDataPoint): void {
    this.points.push(point);
    if (this.points.length > this.capacity) this.points.splice(0, this.points.length - this.capacity);
  }

  all(): MetricsDataPoint[] {
    return this.points.slice();
  }

  get size(): number {
    return this.points.length;
  }
}

interface PodBuffer {
  namespace: string;
  name: string;
  containers: Map<string, Ring>;
  lastSeen: number;
}

interface NodeBuffer {
  name: string;
  ring: Ring;
  lastSeen: number;
}

interface ClusterState {
  pods: Map<string, PodBuffer>;
  nodes: Map<string, NodeBuffer>;
  timer: ReturnType<typeof setInterval> | null;
  inflight: Promise<void> | null;
  lastCollectAt: number;
  lastAccessAt: number;
  /** Set once metrics.k8s.io is confirmed absent; cleared on reconnect. */
  unavailable: boolean;
  collectionError: string | null;
  /**
   * Cluster-wide PodMetrics LIST was denied. Listing per touched namespace is
   * slower but keeps the tab working for namespace-scoped RBAC.
   */
  namespaceScoped: boolean;
  fallbackNamespaces: Set<string>;
}

interface RawMetricsItem {
  metadata?: { name?: string; namespace?: string };
  usage?: { cpu?: string; memory?: string };
  containers?: Array<{ name?: string; usage?: { cpu?: string; memory?: string } }>;
}

interface RawMetricsList {
  items?: RawMetricsItem[];
}

function isForbidden(error: unknown): boolean {
  const status = (error as { statusCode?: number } | null)?.statusCode;
  return status === 403;
}

export class MetricsHistoryStore {
  private readonly clusters = new Map<ClusterId, ClusterState>();

  constructor(private readonly connection: (id: ClusterId) => ClusterConnection) {}

  /**
   * History for one Pod or Node. Called from the Metrics tab; also wakes the
   * cluster's collector and keeps it alive for `IDLE_STOP_MS`.
   */
  async history(request: MetricsHistoryRequest): Promise<MetricsHistory> {
    if (request.kind !== "Pod" && request.kind !== "Node") throw new Error("Metrics exist only for Pods and Nodes.");
    const name = typeof request.name === "string" ? request.name.trim() : "";
    if (!name) throw new Error("A resource name is required.");
    const namespace = request.kind === "Pod" ? request.namespace?.trim() : undefined;
    if (request.kind === "Pod" && !namespace) throw new Error("A pod namespace is required.");

    const state = this.stateFor(request.clusterId);
    state.lastAccessAt = Date.now();
    // Remember the namespaces touched while a Metrics tab is open: if a
    // cluster-wide PodMetrics LIST is denied, these are sampled per namespace.
    if (request.kind === "Pod" && state.fallbackNamespaces.size < MAX_FALLBACK_NAMESPACES) {
      state.fallbackNamespaces.add(namespace!);
    }

    // The first read of a freshly opened tab asks for a sample right away;
    // later reads reuse the poller's 30s cadence.
    await this.sampleIfStale(request.clusterId, state);
    this.ensureTimer(request.clusterId, state);

    return this.snapshot(request, state);
  }

  /** Disconnecting a cluster discards its buffer — the connection is gone. */
  stop(clusterId: ClusterId): void {
    const state = this.clusters.get(clusterId);
    if (!state) return;
    if (state.timer) clearInterval(state.timer);
    this.clusters.delete(clusterId);
  }

  stopAll(): void {
    for (const id of [...this.clusters.keys()]) this.stop(id);
  }

  private stateFor(clusterId: ClusterId): ClusterState {
    const existing = this.clusters.get(clusterId);
    if (existing) return existing;
    const created: ClusterState = {
      pods: new Map(),
      nodes: new Map(),
      timer: null,
      inflight: null,
      lastCollectAt: 0,
      lastAccessAt: Date.now(),
      unavailable: false,
      collectionError: null,
      namespaceScoped: false,
      fallbackNamespaces: new Set(),
    };
    this.clusters.set(clusterId, created);
    return created;
  }

  private ensureTimer(clusterId: ClusterId, state: ClusterState): void {
    if (state.timer || this.clusters.get(clusterId) !== state) return;
    state.timer = setInterval(() => {
      const current = this.clusters.get(clusterId);
      if (!current) return;
      // Idle tabs/clusters stop sampling but keep the samples already
      // collected, so reopening the tab continues the same line.
      if (Date.now() - current.lastAccessAt > IDLE_STOP_MS) {
        if (current.timer) clearInterval(current.timer);
        current.timer = null;
        return;
      }
      void this.collect(clusterId, current);
    }, POLL_INTERVAL_MS);
  }

  private async sampleIfStale(clusterId: ClusterId, state: ClusterState): Promise<void> {
    if (state.inflight) {
      await state.inflight;
      return;
    }
    if (Date.now() - state.lastCollectAt < POLL_INTERVAL_MS - 5_000) return;
    await this.collect(clusterId, state);
  }

  private collect(clusterId: ClusterId, state: ClusterState): Promise<void> {
    if (state.inflight) return state.inflight;
    state.inflight = this.runCollection(clusterId, state).finally(() => {
      state.inflight = null;
      state.lastCollectAt = Date.now();
    });
    return state.inflight;
  }

  private async runCollection(clusterId: ClusterId, state: ClusterState): Promise<void> {
    let connection: ClusterConnection;
    try {
      connection = this.connection(clusterId);
    } catch (error) {
      // Disconnected while the timer was pending: drop the buffer so a later
      // reconnect starts from a clean line.
      state.collectionError = errorMessage(error);
      if (state.timer) clearInterval(state.timer);
      state.timer = null;
      this.clusters.delete(clusterId);
      return;
    }

    let discovery: ApiResourceInfo[];
    try {
      discovery = await connection.discovery.get();
    } catch (error) {
      state.collectionError = errorMessage(error);
      return;
    }

    const metricsApi = discovery.filter(
      (resource) => resource.group === "metrics.k8s.io" && (resource.kind === "PodMetrics" || resource.kind === "NodeMetrics"),
    );
    if (metricsApi.length === 0) {
      state.unavailable = true;
      state.collectionError = null;
      return;
    }
    state.unavailable = false;

    const now = Date.now();
    const errors: string[] = [];

    const podMetrics = metricsApi.find((resource) => resource.kind === "PodMetrics");
    if (podMetrics) {
      try {
        await this.collectPods(connection, state, podMetrics, now);
      } catch (error) {
        errors.push(`Pod metrics: ${errorMessage(error)}`);
      }
    }

    const nodeMetrics = metricsApi.find((resource) => resource.kind === "NodeMetrics");
    if (nodeMetrics) {
      try {
        await this.collectNodes(connection, state, nodeMetrics, now);
      } catch (error) {
        errors.push(`Node metrics: ${errorMessage(error)}`);
      }
    }

    state.collectionError = errors.length ? errors.join(" · ") : null;
    this.prune(state, now);
  }

  private async collectPods(
    connection: ClusterConnection,
    state: ClusterState,
    resource: ApiResourceInfo,
    now: number,
  ): Promise<void> {
    const scopes: Array<string | undefined> = state.namespaceScoped
      ? [...state.fallbackNamespaces]
      : [undefined];
    const failures: string[] = [];
    for (const scope of scopes) {
      let result: RawMetricsList;
      try {
        result = await kubeRequest<RawMetricsList>(
          connection.kc,
          buildApiPath(resource.apiVersion, resource.plural, scope),
          { timeoutMs: LIST_TIMEOUT_MS },
        );
      } catch (error) {
        if (scope === undefined && isForbidden(error)) {
          // Namespace-scoped RBAC: retry per namespace from now on.
          state.namespaceScoped = true;
          if (state.fallbackNamespaces.size === 0) return;
          await this.collectPods(connection, state, resource, now);
          return;
        }
        if (scope !== undefined) {
          // One inaccessible namespace must not starve the others.
          failures.push(`${scope}: ${errorMessage(error)}`);
          continue;
        }
        throw error;
      }

      const timestamp = now;
      for (const item of result.items ?? []) {
        const namespace = item.metadata?.namespace ?? scope;
        const name = item.metadata?.name;
        if (!namespace || !name) continue;
        const key = `${namespace}/${name}`;
        let buffer = state.pods.get(key);
        if (!buffer) {
          buffer = { namespace, name, containers: new Map(), lastSeen: timestamp };
          state.pods.set(key, buffer);
        }
        buffer.lastSeen = timestamp;

        const seenContainers = new Set<string>();
        for (const container of item.containers ?? []) {
          const containerName = container.name;
          if (!containerName) continue;
          seenContainers.add(containerName);
          let ring = buffer.containers.get(containerName);
          if (!ring) {
            ring = new Ring(HISTORY_CAPACITY);
            buffer.containers.set(containerName, ring);
          }
          ring.add({
            timestamp,
            cpu: parseCpuMilli(container.usage?.cpu),
            memory: parseMemoryBytes(container.usage?.memory),
          });
        }
        // A container that disappears (pod restart/resize) must not leave a
        // frozen line in the chart.
        for (const containerName of [...buffer.containers.keys()]) {
          if (!seenContainers.has(containerName)) buffer.containers.delete(containerName);
        }
      }
    }
    if (failures.length) throw new Error(failures.join("; "));
  }

  private async collectNodes(
    connection: ClusterConnection,
    state: ClusterState,
    resource: ApiResourceInfo,
    now: number,
  ): Promise<void> {
    const result = await kubeRequest<RawMetricsList>(
      connection.kc,
      buildApiPath(resource.apiVersion, resource.plural),
      { timeoutMs: LIST_TIMEOUT_MS },
    );
    for (const item of result.items ?? []) {
      const name = item.metadata?.name;
      if (!name) continue;
      let buffer = state.nodes.get(name);
      if (!buffer) {
        buffer = { name, ring: new Ring(HISTORY_CAPACITY), lastSeen: now };
        state.nodes.set(name, buffer);
      }
      buffer.lastSeen = now;
      buffer.ring.add({
        timestamp: now,
        cpu: parseCpuMilli(item.usage?.cpu),
        memory: parseMemoryBytes(item.usage?.memory),
      });
    }
  }

  private prune(state: ClusterState, now: number): void {
    const threshold = now - STALE_MS;
    for (const [key, buffer] of state.pods) {
      if (buffer.lastSeen < threshold) state.pods.delete(key);
    }
    for (const [name, buffer] of state.nodes) {
      if (buffer.lastSeen < threshold) state.nodes.delete(name);
    }
  }

  private snapshot(request: MetricsHistoryRequest, state: ClusterState): MetricsHistory {
    const base: MetricsHistory = {
      kind: request.kind,
      name: request.name,
      namespace: request.kind === "Pod" ? request.namespace : undefined,
      series: [],
      intervalSeconds: POLL_INTERVAL_MS / 1000,
      capacity: HISTORY_CAPACITY,
      unavailable: state.unavailable || undefined,
      collectionError: state.collectionError ?? undefined,
    };

    if (request.kind === "Node") {
      const buffer = state.nodes.get(request.name);
      if (buffer && buffer.ring.size > 0) {
        base.series = [{ name: buffer.name, dataPoints: buffer.ring.all() } satisfies MetricsSeries];
      }
      return base;
    }

    const buffer = state.pods.get(`${request.namespace}/${request.name}`);
    if (buffer) {
      base.series = [...buffer.containers.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, ring]) => ({ name, dataPoints: ring.all() }) satisfies MetricsSeries)
        .filter((series) => series.dataPoints.length > 0);
    }
    return base;
  }
}
