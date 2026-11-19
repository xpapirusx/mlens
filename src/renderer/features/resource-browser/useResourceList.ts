import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiResourceInfo, KubeObject, WatchEventBatch, WatchEventPayload } from "@shared/types";
import { api, call, errorText } from "../../lib/api";
import { helmRow } from "../../lib/helm";
import { toast } from "../../design-system/components/Toast";

export interface ResourceListState {
  items: KubeObject[];
  loading: boolean;
  /** True while "load every page" (search across all names) is running. */
  loadingAll: boolean;
  error: string | null;
  watchState: "connecting" | "live" | "error" | "off";
  lastUpdated: number | null;
  hasMore: boolean;
  total: number | null;
  refresh: (silent?: boolean) => Promise<void>;
  loadMore: () => Promise<void>;
  /** Follows every continue token so client-side search sees all names. */
  loadAll: () => Promise<void>;
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
 * A3: apply a whole watch batch in one pass. One event used to mean one
 * `findIndex` + one array copy + one render of the workspace. Every event is
 * resolved against the original list (uid first, then name — the same
 * fallback the single-event path had, so a recreated object still matches its
 * old row), the last op per row wins, then at most one new array is built.
 */
function applyWatchEvents(current: KubeObject[], events: WatchEventPayload[]): KubeObject[] {
  const slots = new Map<string, number>();
  for (let i = 0; i < current.length; i++) {
    const meta = current[i].metadata;
    if (meta?.uid) slots.set(meta.uid, i);
    if (meta?.name) slots.set(`${meta.namespace}/${meta.name}`, i);
  }

  const slotOps = new Map<number, WatchEventPayload>();
  const newOps = new Map<string, WatchEventPayload>();
  let relevant = 0;
  for (const event of events) {
    const object = event.object;
    if (!object?.metadata?.name) continue;
    if (event.type !== "ADDED" && event.type !== "MODIFIED" && event.type !== "DELETED") continue;
    relevant += 1;
    const meta = object.metadata;
    const key = meta.uid ?? `${meta.namespace}/${meta.name}`;
    const byUid = meta.uid ? slots.get(meta.uid) : undefined;
    const target = byUid ?? slots.get(`${meta.namespace}/${meta.name}`) ?? -1;
    if (target === -1) newOps.set(key, event);
    else slotOps.set(target, event);
  }
  if (relevant === 0) return current;

  const next: KubeObject[] = [];
  let changed = false;
  for (let i = 0; i < current.length; i++) {
    const event = slotOps.get(i);
    if (event) {
      changed = true;
      if (event.type !== "DELETED" && event.object) next.push(event.object);
      continue;
    }
    next.push(current[i]);
  }
  // New objects land at the front, like the single-event path did.
  const added: KubeObject[] = [];
  for (const event of newOps.values()) {
    if (event.type === "DELETED" || !event.object) continue; // was never in the list
    added.push(event.object);
    changed = true;
  }
  return changed ? [...added, ...next] : current;
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
  const [loadingAll, setLoadingAll] = useState(false);
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
  /**
   * The scope whose list request is currently in flight. Polling must not
   * supersede it: a slow list (Helm inventories with thousands of revision
   * Secrets take tens of seconds) would otherwise be discarded every 30s and
   * the table would stay on "Loading…" forever.
   */
  const inFlightScope = useRef<string | null>(null);
  const loadingAllRef = useRef(false);
  /** Whether the next fetch follows a namespace-only change (keep rows, no spinner). */
  const silentScopeChange = useRef(false);
  const previousResourceKey = useRef<string | null>(null);

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
      if (inFlightScope.current === scopeKey) return null;
      inFlightScope.current = scopeKey;
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
          return undefined;
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
          setTotal((current) =>
            token ? current : result.items.length + (result.remainingItemCount ?? 0),
          );
          if (!token && !loadedOnce.current) {
            loadedOnce.current = true;
            setListEpoch((value) => value + 1);
          }
          return result.continueToken;
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
          // A2: every namespace list carries a cluster-wide resourceVersion —
          // keep it so the per-namespace watches resume from the list instead
          // of replaying the whole collection as per-object events.
          resourceVersionRef.current = results.find((result) => result.resourceVersion)?.resourceVersion;
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
        return undefined;
      } catch (fetchError) {
        if (current !== generation.current) return undefined;
        setError(errorText(fetchError));
        return undefined;
      } finally {
        if (inFlightScope.current === scopeKey) inFlightScope.current = null;
        if (current === generation.current) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clusterId, apiVersion, kind, resource, scopeKey],
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

  /**
   * Pull every remaining page (capped) so table search and column filters cover
   * the whole inventory, not only the first 2000 rows. Silent: rows appear as
   * pages arrive and the footer reports progress.
   */
  const loadAll = useCallback(async () => {
    if (loadingAllRef.current) return;
    let token: string | null | undefined = continueToken;
    if (!token) return;
    loadingAllRef.current = true;
    setLoadingAll(true);
    let pages = 0;
    let skips = 0;
    try {
      while (token && pages < 20) {
        const next = await fetchPage(token, true);
        if (next === null) {
          // A poll/refresh holds the scope; wait and retry the same page.
          skips += 1;
          if (skips > 20) break;
          await new Promise((resolve) => window.setTimeout(resolve, 250));
          continue;
        }
        skips = 0;
        pages += 1;
        token = next;
      }
    } finally {
      loadingAllRef.current = false;
      setLoadingAll(false);
    }
  }, [continueToken, fetchPage]);

  useEffect(() => {
    const resourceKey = `${clusterId}|${apiVersion ?? ""}|${kind ?? ""}`;
    const resourceChanged = previousResourceKey.current !== resourceKey;
    previousResourceKey.current = resourceKey;
    // A namespace-scope change is not a different kind: keep the current rows
    // on screen and refetch silently, so clicking a Namespace cell swaps the
    // data without the central loading spinner. Kind/cluster switches still
    // clear and show the spinner.
    silentScopeChange.current = !resourceChanged && loadedOnce.current;
    if (!resourceChanged) return;
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
    const silent = silentScopeChange.current;
    silentScopeChange.current = false;
    void refresh(silent);
    // A Create-from-YAML apply in the dock does not know which table is open:
    // every mounted list refetches when this fires.
    const onApplied = () => void refresh(true);
    window.addEventListener("mlens:resources-applied", onApplied);
    if (!refreshSeconds) {
      return () => window.removeEventListener("mlens:resources-applied", onApplied);
    }
    const timer = window.setInterval(() => void refresh(true), refreshSeconds * 1000);
    return () => {
      window.removeEventListener("mlens:resources-applied", onApplied);
      window.clearInterval(timer);
    };
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
    // A2: both single- and multi-scope watches start from the list's
    // resourceVersion — a watch without one replays the entire collection as
    // per-object events (the multi-namespace path did exactly that). The
    // effect re-runs via `listEpoch` once the first list arrives.
    if (!resourceVersionRef.current) {
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

    const off = api.resources.onWatchEvent((batch: WatchEventBatch) => {
      if (disposed) return;
      let nextState: ResourceListState["watchState"] | null = null;
      const data: WatchEventPayload[] = [];
      for (const entry of batch.events) {
        if (!ids.includes(entry.subscriptionId)) continue;
        if (entry.type === "ERROR") {
          nextState = "error";
          continue;
        }
        // Everything else — including the synthetic BOOKMARK ping main sends
        // when the stream is established — means the watch is live.
        nextState = "live";
        if (entry.object?.metadata?.name) data.push(entry);
      }
      if (nextState !== null) setWatchState(nextState);
      if (data.length === 0) return;

      // Track the newest cluster-wide resourceVersion so a later scope switch
      // resumes without replaying the whole collection (A2).
      for (const entry of data) {
        const resourceVersion = entry.object?.metadata?.resourceVersion;
        if (resourceVersion) resourceVersionRef.current = resourceVersion;
      }

      setItems((current) => applyWatchEvents(current, data));
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
          resourceVersion: resourceVersionRef.current,
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
    loadingAll,
    error,
    watchState,
    lastUpdated,
    hasMore: Boolean(continueToken),
    total,
    refresh,
    loadMore,
    loadAll,
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
