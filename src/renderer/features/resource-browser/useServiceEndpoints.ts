import { useEffect, useMemo, useState } from "react";
import type { ApiResourceInfo, KubeObject } from "@shared/types";
import { api, call } from "../../lib/api";

/**
 * Maps `${namespace}/${service}` → the number of ready addresses behind it,
 * read from the core `Endpoints` objects. Only fetched while a Service table is
 * on screen: one request per namespace scope, nothing at all for other kinds.
 * Missing entries mean "not fetched", which the Endpoints cell renders as "–"
 * rather than pretending the Service has no backends.
 */
export function useServiceEndpoints({
  clusterId,
  resource,
  namespaces,
  active,
  refreshSeconds,
}: {
  clusterId: string;
  resource: ApiResourceInfo | undefined;
  namespaces: string[];
  active: boolean;
  refreshSeconds: number;
}): Map<string, number> {
  const [endpoints, setEndpoints] = useState<KubeObject[]>([]);
  const enabled = active && resource?.kind === "Service";
  const scopeKey = namespaces.join("|");

  useEffect(() => {
    if (!enabled) {
      setEndpoints([]);
      return;
    }
    let disposed = false;
    const load = async (quiet: boolean) => {
      if (!quiet) setEndpoints([]);
      const scopes = namespaces.length ? namespaces : [undefined];
      const results = await Promise.allSettled(
        scopes.map((namespace) =>
          call(api.resources.list({ clusterId, apiVersion: "v1", kind: "Endpoints", namespace, limit: 2000 })),
        ),
      );
      if (disposed) return;
      const found: KubeObject[] = [];
      for (const result of results) {
        if (result.status === "fulfilled") found.push(...result.value.items);
      }
      setEndpoints(found);
    };
    void load(false);
    const interval =
      refreshSeconds > 0 ? window.setInterval(() => void load(true), Math.max(30, refreshSeconds) * 1000) : null;
    return () => {
      disposed = true;
      if (interval) window.clearInterval(interval);
    };
  }, [enabled, clusterId, scopeKey, refreshSeconds]);

  return useMemo(() => {
    const map = new Map<string, number>();
    for (const item of endpoints) {
      const namespace = item.metadata?.namespace ?? "";
      const name = item.metadata?.name ?? "";
      const subsets = (item.subsets ?? []) as Array<{ addresses?: unknown[] }>;
      let count = 0;
      for (const subset of subsets) count += (subset.addresses ?? []).length;
      map.set(`${namespace}/${name}`, count);
    }
    return map;
  }, [endpoints]);
}
