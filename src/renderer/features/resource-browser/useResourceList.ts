import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiResourceInfo, KubeObject, WatchEventPayload } from "@shared/types";
import { api, call, errorText } from "../../lib/api";
import { helmRow } from "../../lib/helm";
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

function mergeByUid(items: KubeObject[]): KubeObject[] {
  const byUid = new Map<string, KubeObject>();
  for (const item of items) {
    const key = item.metadata?.uid ?? `${item.metadata?.namespace}/${item.metadata?.name}`;
    byUid.set(key, item);
  }
  return [...byUid.values()];
}

/**
 * Resource listing with multiple namespace scopes.
 *
 * `namespaces = []` means "all namespaces". A single namespace uses the normal
 * paged list + resourceVersion watch. Several namespaces are fetched in
 * parallel and each namespace gets its own watch; the merged list is presented
 * as one table (Radar-style), with the Namespace column visible.
 */
export function useResourceList(options: {
  clusterId: string;
  resource: ApiResourceInfo | undefined;
  namespaces: string[];
  refreshSeconds: number;
}): ResourceListState {
  const { clusterId, resource, namespaces, refreshSeconds } = options;
  const [items, setItems] = useState<KubeObject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watchState, setWatchState] = useState<ResourceListState["watchState"]>("off");
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [continueToken, setContinueToken] = useState<string | undefined>(undefined);
  const [total, setTotal] = useState<number | null>(null);
  const [listEpoch, setListEpoch] = useState(0);

  const generation = useRef(0);
  const subscriptions = useRef<string[]>([]);
  const resourceVersionRef = useRef<string | undefined>(undefined);
  const loadedOnce = useRef(false);

  const apiVersion = resource?.apiVersion;
  const kind = resource?.kind;
  /** Helm releases come from release secrets, not from a watchable API. */
  const isHelm = kind === "HelmRelease" && apiVersion === "helm.sh/v1";
  const scopes: Array<string | undefined> =
    !resource?.namespaced || namespaces.length === 0 ? [undefined] : namespaces;
  const scopeKey = `${resource?.apiVersion ?? ""}|${resource?.kind ?? ""}|${[...namespaces].sort().join(",")}`;
  const multiple = scopes.length > 1;

  const fetchPage = useCallback(
    async (token: string | undefined, silent: boolean) => {
      if (!resource || !apiVersion || !kind) return;
      const current = ++generation.current;
      if (!silent) setLoading(true);
      try {
        if (isHelm) {
          const summaries: Awaited<ReturnType<typeof api.helm.list>> = [];
          const failures: string[] = [];
          for (const scope of scopes) {
            try {
              summaries.push(...(await call(api.helm.list({ clusterId, namespace: scope }))));
            } catch (listError) {
              failures.push(errorText(listError));
            }
          }
          if (current !== generation.current) return;
          // Every scope failed → surface the first error like any list failure.
          if (failures.length === scopes.length && summaries.length === 0) throw new Error(failures[0]);
          const rows = summaries.map(helmRow);
          resourceVersionRef.current = undefined;
          setError(null);
          setContinueToken(undefined);
          setItems(rows);
          setTotal(rows.length);
          if (!loadedOnce.current) {
            loadedOnce.current = true;
            setListEpoch((value) => value + 1);
          }
          setLastUpdated(Date.now());
          setLoading(false);
          return;
        }
        if (scopes.length === 1) {
          const result = await call(
            api.resources.list({
              clusterId,
              apiVersion,
              kind,
              namespace: scopes[0],
              limit: 2000,
              continueToken: token,
            }),
          );
          if (current !== generation.current) return;
          resourceVersionRef.current = result.resourceVersion ?? undefined;
          setError(null);
          setContinueToken(result.continueToken);
          setItems((previous) => (token ? [...previous, ...result.items] : result.items));
          setTotal(token ? null : result.items.length + (result.remainingItemCount ?? 0));
          if (!token && !loadedOnce.current) {
            loadedOnce.current = true;
            setListEpoch((value) => value + 1);
          }
        } else {
          const results = await Promise.all(
            scopes.map((scope) =>
              call(
                api.resources.list({
                  clusterId,
                  apiVersion,
                  kind,
                  namespace: scope,
                  limit: 1000,
                }),
              ),
            ),
          );
          if (current !== generation.current) return;
          resourceVersionRef.current = undefined;
          setError(null);
          setContinueToken(undefined);
          setItems(mergeByUid(results.flatMap((result) => result.items)));
          setTotal(results.reduce((sum, result) => sum + result.items.length + (result.remainingItemCount ?? 0), 0));
          if (!loadedOnce.current) {
            loadedOnce.current = true;
            setListEpoch((value) => value + 1);
          }
        }
        setLastUpdated(Date.now());
      } catch (fetchError) {
        if (current !== generation.current) return;
        setError(errorText(fetchError));
      } finally {
        if (current === generation.current) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clusterId, apiVersion, kind, resource, scopeKey],
  );

  const refresh = useCallback(async (silent = false) => fetchPage(undefined, silent), [fetchPage]);

  const loadMore = useCallback(async () => {
    if (!continueToken) return;
    await fetchPage(continueToken, true);
  }, [continueToken, fetchPage]);

  useEffect(() => {
    setItems([]);
    setContinueToken(undefined);
    setTotal(null);
    setLastUpdated(null);
    resourceVersionRef.current = undefined;
    loadedOnce.current = false;
    setListEpoch(0);
  }, [clusterId, apiVersion, kind, scopeKey]);

  useEffect(() => {
    if (!resource) {
      setItems([]);
      setError(null);
      return;
    }
    void refresh(false);
    if (!refreshSeconds) return;
    const timer = window.setInterval(() => void refresh(true), refreshSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [resource, refresh, refreshSeconds]);

  // Live watches: one per scope so multi-namespace views stay live too.
  useEffect(() => {
    if (!resource || !apiVersion || !kind) {
      setWatchState("off");
      return;
    }
    // Helm releases are secret-backed: there is no watch, polling refreshes them.
    if (isHelm) {
      setWatchState("off");
      return;
    }
    if (!multiple && !resourceVersionRef.current) {
      setWatchState("off");
      return;
    }

    const ids = scopes.map(
      (_, index) =>
        `watch-${clusterId}-${apiVersion}-${kind}-${scopes[index] ?? "all"}-${Math.random().toString(36).slice(2, 7)}`,
    );
    const previous = subscriptions.current;
    subscriptions.current = ids;
    let disposed = false;
    setWatchState("connecting");

    const off = api.resources.onWatchEvent((payload: WatchEventPayload) => {
      if (disposed || !ids.includes(payload.subscriptionId)) return;
      if (payload.type === "ERROR") {
        setWatchState("error");
        return;
      }
      setWatchState("live");
      const object = payload.object;
      if (!object?.metadata?.name) return;

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

    ids.forEach((subscriptionId, index) => {
      void api.resources
        .watch({
          subscriptionId,
          clusterId,
          apiVersion,
          kind,
          namespace: scopes[index],
          resourceVersion: multiple ? undefined : resourceVersionRef.current,
        })
        .catch((watchError) => {
          if (disposed) return;
          setWatchState("error");
          console.warn("[watch] failed", errorText(watchError));
        });
    });

    return () => {
      disposed = true;
      off();
      for (const id of [...ids, ...previous]) void api.resources.unwatch(id).catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterId, apiVersion, kind, scopeKey, resource, multiple, listEpoch]);

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
