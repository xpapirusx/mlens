import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiResourceInfo, KubeObject, WatchEventPayload } from "@shared/types";
import { api, call, errorText } from "../../lib/api";
import { toast } from "../../design-system/components/Toast";

export interface ResourceListState {
  items: KubeObject[];
  loading: boolean;
  error: string | null;
  watchState: "connecting" | "live" | "error" | "off";
  lastUpdated: number | null;
  hasMore: boolean;
  total: number | null;
  refresh: (silent?: boolean) => Promise<void>;
  loadMore: () => Promise<void>;
}

export function useResourceList(options: {
  clusterId: string;
  resource: ApiResourceInfo | undefined;
  namespace: string;
  refreshSeconds: number;
}): ResourceListState {
  const { clusterId, resource, namespace, refreshSeconds } = options;
  const [items, setItems] = useState<KubeObject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watchState, setWatchState] = useState<ResourceListState["watchState"]>("off");
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [continueToken, setContinueToken] = useState<string | undefined>(undefined);
  const [total, setTotal] = useState<number | null>(null);

  const generation = useRef(0);
  const subscriptionRef = useRef<string | null>(null);
  const resourceVersionRef = useRef<string | undefined>(undefined);

  const scope = resource?.namespaced && namespace !== "all" ? namespace : undefined;
  const apiVersion = resource?.apiVersion;
  const kind = resource?.kind;

  const fetchPage = useCallback(
    async (token: string | undefined, silent: boolean) => {
      if (!resource || !apiVersion || !kind) return;
      const current = ++generation.current;
      if (!silent) setLoading(true);
      try {
        const result = await call(
          api.resources.list({
            clusterId,
            apiVersion,
            kind,
            namespace: scope,
            limit: 2000,
            continueToken: token,
          }),
        );
        if (current !== generation.current) return;
        setError(null);
        setContinueToken(result.continueToken);
        resourceVersionRef.current = result.resourceVersion;
        setItems((previous) => (token ? [...previous, ...result.items] : result.items));
        setTotal(
          token
            ? null
            : result.items.length + (result.remainingItemCount ?? 0),
        );
        setLastUpdated(Date.now());
      } catch (fetchError) {
        if (current !== generation.current) return;
        setError(errorText(fetchError));
      } finally {
        if (current === generation.current) setLoading(false);
      }
    },
    [clusterId, apiVersion, kind, resource, scope],
  );

  const refresh = useCallback(
    async (silent = false) => {
      await fetchPage(undefined, silent);
    },
    [fetchPage],
  );

  const loadMore = useCallback(async () => {
    if (!continueToken) return;
    await fetchPage(continueToken, true);
  }, [continueToken, fetchPage]);

  // Initial load + polling. Polling reconciles any watch events that were
  // missed while the connection was reconnecting.
  useEffect(() => {
    if (!resource) {
      setItems([]);
      setError(null);
      return;
    }
    void refresh(false);
    if (!refreshSeconds) return;
    const timer = window.setInterval(() => {
      void refresh(true);
    }, refreshSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [resource, refresh, refreshSeconds]);

  // Live watch on the same scope.
  useEffect(() => {
    if (!resource || !apiVersion || !kind) {
      setWatchState("off");
      return;
    }

    const subscriptionId = `watch-${clusterId}-${apiVersion}-${kind}-${scope ?? "all"}-${Math.random().toString(36).slice(2, 7)}`;
    const previousSubscription = subscriptionRef.current;
    subscriptionRef.current = subscriptionId;
    let disposed = false;

    setWatchState("connecting");

    const off = api.resources.onWatchEvent((payload: WatchEventPayload) => {
      if (payload.subscriptionId !== subscriptionId || disposed) return;
      if (payload.type === "ERROR") {
        setWatchState("error");
        return;
      }
      setWatchState("live");
      const object = payload.object;
      if (!object?.metadata?.uid && !object?.metadata?.name) return;

      setItems((current) => {
        const index = current.findIndex(
          (candidate) =>
            (object.metadata.uid && candidate.metadata.uid === object.metadata.uid) ||
            (candidate.metadata.name === object.metadata.name &&
              candidate.metadata.namespace === object.metadata.namespace),
        );
        if (payload.type === "DELETED") {
          if (index === -1) return current;
          const next = [...current];
          next.splice(index, 1);
          return next;
        }
        if (payload.type === "ADDED" || payload.type === "MODIFIED") {
          if (index === -1) return [object, ...current];
          const next = [...current];
          next[index] = object;
          return next;
        }
        return current;
      });
      setLastUpdated(Date.now());
    });

    void api.resources
      .watch({
        subscriptionId,
        clusterId,
        apiVersion,
        kind,
        namespace: scope,
        resourceVersion: resourceVersionRef.current,
      })
      .catch((watchError) => {
        if (disposed) return;
        setWatchState("error");
        console.warn("[watch] failed", errorText(watchError));
      });

    return () => {
      disposed = true;
      off();
      void api.resources.unwatch(subscriptionId).catch(() => undefined);
      if (previousSubscription && previousSubscription !== subscriptionId) {
        void api.resources.unwatch(previousSubscription).catch(() => undefined);
      }
    };
  }, [clusterId, apiVersion, kind, scope, resource]);

  // Reset table data when the user switches kind or namespace.
  useEffect(() => {
    setItems([]);
    setContinueToken(undefined);
    setTotal(null);
    setLastUpdated(null);
  }, [clusterId, apiVersion, kind, scope]);

  return {
    items,
    loading,
    error,
    watchState,
    lastUpdated,
    hasMore: Boolean(continueToken),
    total,
    refresh,
    loadMore,
  };
}

export function useDebouncedValue<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useRefreshToast(): (message: string, error?: unknown) => void {
  return useCallback((message: string, error?: unknown) => {
    if (error) toast.error(message, errorText(error));
    else toast.success(message);
  }, []);
}
