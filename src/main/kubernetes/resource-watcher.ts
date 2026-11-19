import type { KubeObject, WatchEventPayload, WatchResourcesRequest } from "@shared/types";
import { Watch } from "@kubernetes/client-node";
import { buildApiPath, kubeRequest, stripServerMetadata } from "./http";
import type { ClusterConnection } from "./session";

interface WatchState {
  closed: boolean;
  abort?: AbortController;
  resourceVersion?: string;
}

interface WatchListMetadata {
  metadata?: { resourceVersion?: string };
}

/**
 * 410 Gone / expired resourceVersion: the server refuses to resume from that
 * point, so the watch must restart from a freshly listed resourceVersion.
 */
function isExpiredResourceVersion(error: unknown): boolean {
  const candidate = error as { statusCode?: number; message?: string } | undefined;
  if (candidate?.statusCode === 410) return true;
  const message = candidate?.message ?? "";
  return message.includes("too old resourceVersion") || message.includes("Expired");
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

    const pushError = (error: unknown): void => {
      emit({
        subscriptionId: request.subscriptionId,
        type: "ERROR",
        error: error instanceof Error ? error.message : String(error),
      });
    };

    const loop = (): void => {
      if (state.closed) return;
      const watch = new Watch(connection.kc);
      // Tracks whether the attempt failed before the stream was established:
      // client-node resolves its promise in both cases, but a failed attempt
      // calls `done` first (synchronously), a healthy one only later.
      const attempt = { doneFired: false };

      const done = (error?: Error & { statusCode?: number }): void => {
        if (state.closed) return;
        attempt.doneFired = true;
        if (!error) {
          // Clean server-side close (the 300s watch timeout): resume right away.
          setTimeout(loop, 500);
          return;
        }
        if (isExpiredResourceVersion(error)) {
          // A6: re-list for a fresh resourceVersion and resume — retrying the
          // stale one would fail forever every few seconds.
          void (async () => {
            try {
              const fresh = await kubeRequest<WatchListMetadata>(connection.kc, path, {
                query: { limit: 1 },
                timeoutMs: 15_000,
              });
              if (state.closed) return;
              state.resourceVersion = fresh.metadata?.resourceVersion;
              setTimeout(loop, 200);
            } catch (refreshError) {
              if (state.closed) return;
              pushError(refreshError);
              setTimeout(loop, 5_000);
            }
          })();
          return;
        }
        pushError(error);
        setTimeout(loop, 5_000);
      };

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
            // A4: bookmarks only advance the resourceVersion (stored above) —
            // forwarding them would make the renderer rebuild the table for a
            // row that did not change. The renderer gets a synthetic ping
            // below when the stream is established instead.
            if (phase === "BOOKMARK") return;
            if (object) stripServerMetadata(object);
            emit({
              subscriptionId: request.subscriptionId,
              type: phase as WatchEventPayload["type"],
              object,
            });
          },
          done,
        )
        .then((abort) => {
          state.abort = abort;
          if (state.closed) {
            abort.abort();
            return;
          }
          // The stream is up (a failed attempt already fired `done`). Ping the
          // renderer so the badge flips to "live" without waiting for the first
          // change — and back from "error" after a recovered reconnect.
          if (!attempt.doneFired) {
            emit({ subscriptionId: request.subscriptionId, type: "BOOKMARK" });
          }
        })
        .catch((error) => {
          if (state.closed) return;
          pushError(error);
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
