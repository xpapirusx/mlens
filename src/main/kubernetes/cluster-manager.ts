import type {
  ApiResourceInfo,
  ApplyYamlRequest,
  ApplyYamlResult,
  ClusterConnectionInfo,
  ClusterHealth,
  ClusterId,
  DeleteResourceRequest,
  EvictPodRequest,
  KubeObject,
  ListResourcesRequest,
  ListResourcesResult,
  NamespaceInfo,
  PodContainerInfo,
  PolicyResourceRequest,
  PolicyResourceResponse,
  RbacSubjectRequest,
  RbacSubjectResponse,
  RbacRoleRequest,
  RbacRoleResponse,
  ResourceCountRequest,
  ResourceCountResult,
  ResourceKey,
  RestartRequest,
  ScaleRequest,
} from "@shared/types";
import { dumpYaml, loadAllYaml } from "@kubernetes/client-node";
import { buildApiPath, errorMessage, KubeApiError, kubeRequest } from "./http";
import type { KubeconfigManager } from "./kubeconfig";
import { ClusterConnection } from "./session";
import { ResourceWatcher } from "./resource-watcher";
import { LogStreams } from "./log-streams";
import { ExecSessions } from "./exec-sessions";
import { policyResource } from "./policy";
import { rbacRole, rbacSubject } from "./rbac";
import type { SettingsStore } from "../settings/store";

interface ConnectedSession {
  connection: ClusterConnection;
  info: ClusterConnectionInfo;
}

interface RawList<T> {
  items: T[];
  metadata?: {
    resourceVersion?: string;
    continue?: string;
    remainingItemCount?: number;
  };
}

interface VersionInfo {
  major?: string;
  minor?: string;
  gitVersion?: string;
}

import { resourceCountKey } from "@shared/keys";

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

export class ClusterManager {
  private readonly sessions = new Map<ClusterId, ConnectedSession>();
  readonly watcher = new ResourceWatcher((id) => this.connection(id));
  readonly logs = new LogStreams((id) => this.connection(id));
  readonly exec = new ExecSessions((id) => this.connection(id));

  constructor(
    private readonly kubeconfigs: KubeconfigManager,
    private readonly settings: SettingsStore,
  ) {}

  isConnected(id: ClusterId): boolean {
    return this.sessions.has(id);
  }

  connection(id: ClusterId): ClusterConnection {
    const session = this.sessions.get(id);
    if (!session) throw new Error("Cluster is not connected. Reconnect it from the catalog.");
    return session.connection;
  }

  async connect(id: ClusterId): Promise<ClusterConnectionInfo> {
    const existing = this.sessions.get(id);
    if (existing) return existing.info;

    const resolved = this.kubeconfigs.resolve(id);
    const connection = new ClusterConnection(id, resolved.kubeConfig);

    const startedAt = Date.now();
    const version = await kubeRequest<VersionInfo>(resolved.kubeConfig, "/version", { timeoutMs: 15_000 });
    connection.latencyMs = Date.now() - startedAt;
    connection.version = [version.major, version.minor].filter(Boolean).join(".") || version.gitVersion || "unknown";
    connection.gitVersion = version.gitVersion ?? "";

    // Discovery and namespaces are permission-sensitive: a restricted user may
    // still use the cluster even if either call is denied.
    const [namespaces] = await Promise.all([
      this.fetchNamespaces(connection).catch((error) => {
        console.warn("[cluster] namespace list failed", errorMessage(error));
        return [] as NamespaceInfo[];
      }),
      connection.catalog.refresh().catch((error) => {
        console.warn("[cluster] discovery failed", errorMessage(error));
        return [] as ApiResourceInfo[];
      }),
    ]);

    const info: ClusterConnectionInfo = {
      id,
      name: resolved.contextName,
      context: resolved.contextName,
      server: resolved.kubeConfig.getCurrentCluster()?.server ?? "",
      version: connection.version,
      gitVersion: connection.gitVersion,
      namespaces: namespaces.map((namespace) => namespace.name),
      defaultNamespace: resolved.kubeConfig.getContextObject(resolved.contextName)?.namespace ?? "default",
      user: resolved.kubeConfig.getCurrentUser()?.name,
      connectedAt: Date.now(),
    };

    this.sessions.set(id, { connection, info });
    this.settings.addRecentCluster(id);
    return info;
  }

  async disconnect(id: ClusterId): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) return;
    this.watcher.stopCluster(id);
    this.logs.stopCluster(id);
    this.exec.closeCluster(id);
    this.sessions.delete(id);
  }

  async health(id: ClusterId): Promise<ClusterHealth> {
    const session = this.sessions.get(id);
    if (!session) return { id, status: "disconnected" };
    const startedAt = Date.now();
    try {
      await kubeRequest<VersionInfo>(session.connection.kc, "/version", { timeoutMs: 8_000 });
      session.connection.latencyMs = Date.now() - startedAt;
      return { id, status: "connected", latencyMs: session.connection.latencyMs, checkedAt: Date.now() };
    } catch (error) {
      return {
        id,
        status: "error",
        error: errorMessage(error),
        latencyMs: Date.now() - startedAt,
        checkedAt: Date.now(),
      };
    }
  }

  async namespaces(id: ClusterId): Promise<NamespaceInfo[]> {
    return this.fetchNamespaces(this.connection(id));
  }

  private async fetchNamespaces(connection: ClusterConnection): Promise<NamespaceInfo[]> {
    const result = await kubeRequest<RawList<{ metadata: { name: string }; status?: { phase?: string } }>>(
      connection.kc,
      "/api/v1/namespaces",
      { query: { limit: 1000 } },
    );
    return (result.items ?? [])
      .map((item) => ({
        name: item.metadata.name,
        status: item.status?.phase ?? "Active",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async list(request: ListResourcesRequest): Promise<ListResourcesResult> {
    const connection = this.connection(request.clusterId);
    const info = await connection.catalog.get(request.apiVersion, request.kind);
    const apiPath = buildApiPath(info.apiVersion, info.plural, info.namespaced ? request.namespace : undefined);

    const result = await kubeRequest<RawList<KubeObject>>(connection.kc, apiPath, {
      query: {
        limit: request.limit ?? 2_000,
        continue: request.continueToken,
        labelSelector: request.labelSelector,
        fieldSelector: request.fieldSelector,
      },
      timeoutMs: 45_000,
    });

    return {
      items: result.items ?? [],
      resourceVersion: result.metadata?.resourceVersion,
      continueToken: result.metadata?.continue,
      remainingItemCount: result.metadata?.remainingItemCount,
    };
  }

  async get(request: ResourceKey): Promise<KubeObject> {
    const connection = this.connection(request.clusterId);
    const info = await connection.catalog.get(request.apiVersion, request.kind);
    const apiPath = `${buildApiPath(info.apiVersion, info.plural, info.namespaced ? request.namespace : undefined)}/${encodeURIComponent(request.name)}`;
    return await kubeRequest<KubeObject>(connection.kc, apiPath);
  }

  async counts(request: ResourceCountRequest): Promise<ResourceCountResult[]> {
    const connection = this.connection(request.clusterId);
    const results = await mapWithConcurrency(request.resources, 6, async (resource) => {
      const key = resourceCountKey(request.clusterId, resource.apiVersion, resource.kind, resource.namespace);
      try {
        const info = await connection.catalog.get(resource.apiVersion, resource.kind);
        const result = await kubeRequest<RawList<KubeObject>>(
          connection.kc,
          buildApiPath(info.apiVersion, info.plural, info.namespaced ? resource.namespace : undefined),
          { query: { limit: 1 }, timeoutMs: 20_000 },
        );
        const remaining = result.metadata?.remainingItemCount;
        const count = (result.items?.length ?? 0) + (remaining ?? 0);
        return { key, count, atLeast: remaining !== undefined };
      } catch (error) {
        return { key, count: 0, error: errorMessage(error) };
      }
    });
    return results;
  }

  async patch(request: import("@shared/types").PatchResourceRequest): Promise<KubeObject> {
    const connection = this.connection(request.clusterId);
    const info = await connection.catalog.get(request.apiVersion, request.kind);
    const apiPath = `${buildApiPath(info.apiVersion, info.plural, info.namespaced ? request.namespace : undefined)}/${encodeURIComponent(request.name)}`;
    return await kubeRequest<KubeObject>(connection.kc, apiPath, {
      method: "PATCH",
      headers: { "Content-Type": "application/merge-patch+json" },
      body: request.patch,
    });
  }

  async remove(request: DeleteResourceRequest): Promise<void> {
    const connection = this.connection(request.clusterId);
    const info = await connection.catalog.get(request.apiVersion, request.kind);
    const apiPath = `${buildApiPath(info.apiVersion, info.plural, info.namespaced ? request.namespace : undefined)}/${encodeURIComponent(request.name)}`;
    await kubeRequest(connection.kc, apiPath, {
      method: "DELETE",
      body: {
        apiVersion: "v1",
        kind: "DeleteOptions",
        propagationPolicy: request.propagationPolicy ?? "Background",
        ...(request.force ? { gracePeriodSeconds: 0 } : {}),
      },
    });
  }

  async apply(request: ApplyYamlRequest): Promise<ApplyYamlResult[]> {
    const connection = this.connection(request.clusterId);
    let documents: unknown[];
    try {
      documents = loadAllYaml(request.yaml).filter(Boolean);
    } catch (error) {
      throw new Error(`Invalid YAML: ${error instanceof Error ? error.message : String(error)}`);
    }

    const results: ApplyYamlResult[] = [];
    for (const raw of documents) {
      const object = raw as KubeObject & { items?: KubeObject[] };
      if (object?.kind === "List" && Array.isArray(object.items)) {
        for (const item of object.items) {
          results.push(await this.applyObject(connection, item, Boolean(request.dryRun)));
        }
        continue;
      }
      results.push(await this.applyObject(connection, object, Boolean(request.dryRun)));
    }
    return results;
  }

  private async applyObject(
    connection: ClusterConnection,
    object: KubeObject,
    dryRun: boolean,
  ): Promise<ApplyYamlResult> {
    if (!object?.kind || !object?.apiVersion) {
      throw new Error("Every YAML document needs apiVersion and kind.");
    }
    const name = object.metadata?.name;
    if (!name) throw new Error(`${object.kind} is missing metadata.name.`);

    const info = await connection.catalog.get(object.apiVersion, object.kind);
    const namespace = info.namespaced ? (object.metadata.namespace ?? "default") : undefined;
    const collection = buildApiPath(info.apiVersion, info.plural, namespace);
    const itemPath = `${collection}/${encodeURIComponent(name)}`;

    const payload = { ...object, metadata: { ...object.metadata, namespace } } as KubeObject;
    delete (payload as Record<string, unknown>).status;
    if (payload.metadata) delete payload.metadata.managedFields;

    let action: "created" | "updated" = "created";
    try {
      const existing = await kubeRequest<KubeObject>(connection.kc, itemPath);
      action = "updated";
      payload.metadata = {
        ...existing.metadata,
        ...payload.metadata,
        resourceVersion: existing.metadata.resourceVersion,
      };
    } catch (error) {
      if (!(error instanceof KubeApiError && error.statusCode === 404)) throw error;
    }

    const query = dryRun ? { dryRun: "All" } : undefined;
    const result =
      action === "updated"
        ? await kubeRequest<KubeObject>(connection.kc, itemPath, { method: "PUT", body: payload, query })
        : await kubeRequest<KubeObject>(connection.kc, collection, { method: "POST", body: payload, query });

    return {
      kind: result?.kind ?? info.kind,
      name: result?.metadata?.name ?? name,
      namespace,
      action: dryRun ? ("updated" as const) : action,
    };
  }

  async scale(request: ScaleRequest): Promise<void> {
    const connection = this.connection(request.clusterId);
    const info = await connection.catalog.get(request.apiVersion, request.kind);
    const apiPath = `${buildApiPath(info.apiVersion, info.plural, request.namespace)}/${encodeURIComponent(request.name)}`;
    await kubeRequest(connection.kc, apiPath, {
      method: "PATCH",
      headers: { "Content-Type": "application/merge-patch+json" },
      body: { spec: { replicas: request.replicas } },
    });
  }

  async restart(request: RestartRequest): Promise<void> {
    const connection = this.connection(request.clusterId);
    const info = await connection.catalog.get(request.apiVersion, request.kind);
    const apiPath = `${buildApiPath(info.apiVersion, info.plural, request.namespace)}/${encodeURIComponent(request.name)}`;
    await kubeRequest(connection.kc, apiPath, {
      method: "PATCH",
      headers: { "Content-Type": "application/merge-patch+json" },
      body: {
        spec: {
          template: {
            metadata: {
              annotations: {
                "kubectl.kubernetes.io/restartedAt": new Date().toISOString(),
                "mlens.io/restartedAt": new Date().toISOString(),
              },
            },
          },
        },
      },
    });
  }

  async evict(request: EvictPodRequest): Promise<void> {
    const connection = this.connection(request.clusterId);
    try {
      await kubeRequest(connection.kc, `/api/v1/namespaces/${encodeURIComponent(request.namespace)}/pods/${encodeURIComponent(request.name)}/eviction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: {
          apiVersion: "policy/v1",
          kind: "Eviction",
          metadata: { name: request.name, namespace: request.namespace },
          deleteOptions: { gracePeriodSeconds: request.gracePeriodSeconds },
        },
      });
    } catch (error) {
      // Clusters older than 1.22 do not serve policy/v1 Eviction; fall back to
      // a normal delete so Drain still works there.
      if (!(error instanceof KubeApiError && error.statusCode === 404)) throw error;
      await kubeRequest(
        connection.kc,
        `/api/v1/namespaces/${encodeURIComponent(request.namespace)}/pods/${encodeURIComponent(request.name)}`,
        {
          method: "DELETE",
          body: {
            apiVersion: "v1",
            kind: "DeleteOptions",
            gracePeriodSeconds: request.gracePeriodSeconds,
          },
        },
      );
    }
  }

  async podContainers(clusterId: ClusterId, namespace: string, name: string): Promise<PodContainerInfo[]> {
    const pod = await this.get({ clusterId, apiVersion: "v1", kind: "Pod", namespace, name });
    const specContainers = ((pod.spec?.containers as Array<{ name: string; image: string }> | undefined) ?? []).concat(
      (pod.spec?.initContainers as Array<{ name: string; image: string }> | undefined) ?? [],
    );
    const statuses =
      ((pod.status?.containerStatuses as Array<Record<string, unknown>> | undefined) ?? []).concat(
        (pod.status?.initContainerStatuses as Array<Record<string, unknown>> | undefined) ?? [],
      );

    return specContainers.map((container) => {
      const status = statuses.find((candidate) => candidate.name === container.name);
      const state = (status?.state as Record<string, { reason?: string; startedAt?: string }> | undefined) ?? {};
      const stateKey = Object.keys(state)[0] ?? "waiting";
      return {
        name: container.name,
        image: container.image,
        ready: Boolean(status?.ready),
        restartCount: Number(status?.restartCount ?? 0),
        state: stateKey,
        startedAt: state.running?.startedAt ?? state.terminated?.startedAt,
      };
    });
  }

  /** What the cluster's policy engine reports for one resource. */
  async policyResource(request: PolicyResourceRequest): Promise<PolicyResourceResponse> {
    if (typeof request.kind !== "string" || !request.kind) throw new Error("A resource kind is required.");
    if (typeof request.name !== "string" || !request.name) throw new Error("A resource name is required.");
    return policyResource(this.connection(request.clusterId), request);
  }

  /** Effective RBAC permissions for a ServiceAccount (Radar's reverse lookup). */
  async rbacSubject(request: RbacSubjectRequest): Promise<RbacSubjectResponse> {
    if (typeof request.namespace !== "string" || !request.namespace) {
      throw new Error("A ServiceAccount namespace is required.");
    }
    if (typeof request.name !== "string" || !request.name) {
      throw new Error("A ServiceAccount name is required.");
    }
    return rbacSubject(this.connection(request.clusterId), request);
  }

  /** Bindings referencing a Role/ClusterRole, plus the role's own rules. */
  async rbacRole(request: RbacRoleRequest): Promise<RbacRoleResponse> {
    if (typeof request.name !== "string" || !request.name) throw new Error("A role name is required.");
    if (request.kind !== "Role" && request.kind !== "ClusterRole") {
      throw new Error("Only Role and ClusterRole subjects are supported.");
    }
    if (request.kind === "Role" && !request.namespace) throw new Error("A Role namespace is required.");
    return rbacRole(this.connection(request.clusterId), request);
  }

  /** Serialize an object for the YAML tab (server JSON -> YAML). */
  toYaml(object: unknown): string {
    return dumpYaml(object);
  }

  disposeAll(): void {
    this.watcher.stopAll();
    this.logs.stopAll();
    this.exec.closeAll();
  }
}
