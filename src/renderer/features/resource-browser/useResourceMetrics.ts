import { useEffect, useState } from "react";
import type { ApiResourceInfo, KubeObject } from "@shared/types";
import { api, call } from "../../lib/api";
import { parseCpu, parseMemory } from "../../lib/format";
import { sameMapValues } from "../../lib/stable";

export interface ContainerUsage {
  name: string;
  cpu: number;
  memory: number;
}

export interface PodUsage {
  containers: ContainerUsage[];
  timestamp?: string;
}

export interface NodeUsage {
  cpu: number;
  memory: number;
  /** Allocatable CPU/memory, filled for the Pods table's node context. */
  cpuAllocatable?: number;
  memoryAllocatable?: number;
  timestamp?: string;
}

export interface MetricsState {
  available: boolean;
  pods: Map<string, PodUsage>;
  nodes: Map<string, NodeUsage>;
}

const EMPTY: MetricsState = { available: false, pods: new Map(), nodes: new Map() };

// A13: value-only comparison — `timestamp` is ignored on purpose (it changes
// with every metrics-server sample even when usage is identical).
function sameContainerUsage(left: ContainerUsage, right: ContainerUsage): boolean {
  return left.name === right.name && left.cpu === right.cpu && left.memory === right.memory;
}

function samePodUsage(left: PodUsage, right: PodUsage): boolean {
  return (
    left.containers.length === right.containers.length &&
    left.containers.every((container, index) => sameContainerUsage(container, right.containers[index]))
  );
}

function sameNodeUsage(left: NodeUsage, right: NodeUsage): boolean {
  return (
    left.cpu === right.cpu &&
    left.memory === right.memory &&
    left.cpuAllocatable === right.cpuAllocatable &&
    left.memoryAllocatable === right.memoryAllocatable
  );
}

function sameMetrics(left: MetricsState, right: MetricsState): boolean {
  return (
    left.available === right.available &&
    sameMapValues(left.pods, right.pods, samePodUsage) &&
    sameMapValues(left.nodes, right.nodes, sameNodeUsage)
  );
}

/**
 * Live metrics.k8s.io samples for the visible table. Metrics are optional: if
 * the API is not installed the CPU/Memory cells render "–" rather than fake
 * numbers.
 */
export function useResourceMetrics(options: {
  clusterId: string;
  resource: ApiResourceInfo | undefined;
  resources: ApiResourceInfo[];
  namespaces: string[];
  refreshSeconds: number;
  active: boolean;
}): MetricsState {
  const { clusterId, resource, resources, namespaces, refreshSeconds, active } = options;
  const [state, setState] = useState<MetricsState>(EMPTY);

  const podMetrics = resources.find((entry) => entry.kind === "PodMetrics");
  const nodeMetrics = resources.find((entry) => entry.kind === "NodeMetrics");
  const nodeResource = resources.find((entry) => entry.kind === "Node" && entry.apiVersion === "v1");
  // A CRD can be named `Pod` or `Node` in its own group; metrics.k8s.io only
  // describes the built-in kinds.
  const kind = resource?.isCrd ? undefined : resource?.kind;
  const needsPods = kind === "Pod";
  const needsNodes = kind === "Node";
  // Pods need the node sample + node allocatable only to explain the pod's
  // share of its node in the CPU/Memory tooltip.
  const wantsNodeUsage = (needsNodes || needsPods) && Boolean(nodeMetrics);
  const wantsNodeAllocatable = needsPods && Boolean(nodeResource);
  const enabled = active && (needsPods ? Boolean(podMetrics) : needsNodes ? Boolean(nodeMetrics) : false);
  const scopeKey = [...namespaces].sort().join(",");

  useEffect(() => {
    if (!enabled) {
      setState(EMPTY);
      return;
    }
    let disposed = false;
    const load = async () => {
      try {
        const pods = new Map<string, PodUsage>();
        const nodes = new Map<string, NodeUsage>();

        if (needsPods && podMetrics) {
          const scopes: Array<string | undefined> =
            namespaces.length === 0 ? [undefined] : namespaces;
          const results = await Promise.all(
            scopes.map((scope) =>
              call(
                api.resources.list({
                  clusterId,
                  apiVersion: podMetrics.apiVersion,
                  kind: podMetrics.kind,
                  namespace: scope,
                  limit: 2000,
                }),
              ),
            ),
          );
          for (const result of results) {
            for (const item of result.items as KubeObject[]) {
              const key = `${item.metadata?.namespace}/${item.metadata?.name}`;
              const containers = ((item.containers ?? []) as Array<Record<string, any>>).map((container) => ({
                name: String(container.name ?? ""),
                cpu: parseCpu(container.usage?.cpu) ?? 0,
                memory: parseMemory(container.usage?.memory) ?? 0,
              }));
              pods.set(key, { containers, timestamp: item.timestamp as string | undefined });
            }
          }
        }

        if (wantsNodeUsage && nodeMetrics) {
          const result = await call(
            api.resources.list({
              clusterId,
              apiVersion: nodeMetrics.apiVersion,
              kind: nodeMetrics.kind,
              limit: 1000,
            }),
          );
          for (const item of result.items as KubeObject[]) {
            nodes.set(item.metadata?.name ?? "", {
              cpu: parseCpu((item.usage as any)?.cpu) ?? 0,
              memory: parseMemory((item.usage as any)?.memory) ?? 0,
              timestamp: item.timestamp as string | undefined,
            });
          }
        }

        if (wantsNodeAllocatable && nodeResource) {
          const result = await call(
            api.resources.list({
              clusterId,
              apiVersion: nodeResource.apiVersion,
              kind: nodeResource.kind,
              limit: 1000,
            }),
          );
          for (const item of result.items as KubeObject[]) {
            const name = item.metadata?.name ?? "";
            nodes.set(name, {
              ...(nodes.get(name) ?? { cpu: 0, memory: 0 }),
              cpuAllocatable: parseCpu((item.status?.allocatable as any)?.cpu) ?? 0,
              memoryAllocatable: parseMemory((item.status?.allocatable as any)?.memory) ?? 0,
            });
          }
        }

        if (!disposed) {
          // A13: metrics-server returns a fresh timestamp with every sample;
          // comparing usage values (not timestamps) keeps the state identity
          // stable while the numbers are unchanged, so a 60s poll stops
          // re-running every cell/sort/filter memo.
          const next: MetricsState = { available: needsPods ? pods.size > 0 : nodes.size > 0, pods, nodes };
          setState((current) => (sameMetrics(current, next) ? current : next));
        }
      } catch {
        if (!disposed) setState(EMPTY);
      }
    };

    void load();
    const interval = refreshSeconds > 0 ? Math.max(60, refreshSeconds) : 0;
    if (!interval) return () => { disposed = true; };
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, interval * 1000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [
    clusterId,
    enabled,
    needsPods,
    needsNodes,
    podMetrics,
    nodeMetrics,
    nodeResource,
    scopeKey,
    refreshSeconds,
  ]);

  return state;
}
