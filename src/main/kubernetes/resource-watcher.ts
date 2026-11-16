import type { KubeObject, WatchEventPayload, WatchResourcesRequest } from "@shared/types";
import { Watch } from "@kubernetes/client-node";
import { buildApiPath } from "./http";
import type { ClusterConnection } from "./session";

interface WatchState {
  closed: boolean;
  abort?: AbortController;
  resourceVersion?: string;
}

export class ResourceWatcher {
  private readonly subscriptions = new Map<string, { clusterId: string; stop: () => void }>();

  constructor(private readonly getConnection: (clusterId: string) => ClusterConnection) {}

  async start(request: WatchResourcesRequest, emit: (event: WatchEventPayload) => void): Promise<void> {
    this.stop(request.subscriptionId);

    const connection = this.getConnection(request.clusterId);
    const info = await connection.catalog.get(request.apiVersion, request.kind);
    const path = buildApiPath(info.apiVersion, info.plural, info.namespaced ? request.namespace : undefined);
    const state: WatchState = { closed: false, resourceVersion: request.resourceVersion };

    const stop = () => {
      state.closed = true;
      state.abort?.abort();
      this.subscriptions.delete(request.subscriptionId);
    };

    this.subscriptions.set(request.subscriptionId, { clusterId: request.clusterId, stop });

    const loop = (): void => {
      if (state.closed) return;
      const watch = new Watch(connection.kc);

      void watch
        .watch(
          path,
          {
            watch: true,
            allowWatchBookmarks: true,
            resourceVersion: state.resourceVersion,
            labelSelector: request.labelSelector,
            fieldSelector: request.fieldSelector,
            timeoutSeconds: 300,
          },
          (phase, apiObj) => {
            if (state.closed) return;
            const object = apiObj as KubeObject | undefined;
            if (object?.metadata?.resourceVersion) state.resourceVersion = object.metadata.resourceVersion;
            emit({
              subscriptionId: request.subscriptionId,
              type: phase as WatchEventPayload["type"],
              object,
            });
          },
          () => {
            // Server-side watch timeout: reconnect from the last resourceVersion.
            if (state.closed) return;
            setTimeout(loop, 500);
          },
        )
        .then((abort) => {
          state.abort = abort;
          if (state.closed) abort.abort();
        })
        .catch((error) => {
          if (state.closed) return;
          emit({
            subscriptionId: request.subscriptionId,
            type: "ERROR",
            error: error instanceof Error ? error.message : String(error),
          });
          setTimeout(loop, 5_000);
        });
    };

    loop();
  }

  stop(subscriptionId: string): void {
    this.subscriptions.get(subscriptionId)?.stop();
    this.subscriptions.delete(subscriptionId);
  }

  stopCluster(clusterId: string): void {
    for (const [id, entry] of this.subscriptions) {
      if (entry.clusterId !== clusterId) continue;
      entry.stop();
      this.subscriptions.delete(id);
    }
  }

  stopAll(): void {
    for (const entry of this.subscriptions.values()) entry.stop();
    this.subscriptions.clear();
  }
}
