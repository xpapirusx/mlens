import { useEffect, useState } from "react";
import { api, call } from "../../lib/api";

const PAGE_LIMIT = 2000;
const MAX_PAGES = 10;

/**
 * Maps node name → number of pods currently scheduled on it, for the Nodes
 * table's Pods bar (`used / allocatable`). Only fetched while a Nodes table is
 * on screen. Pods are listed once cluster-wide and counted here, so one refresh
 * costs a few paged list calls instead of one request per node.
 */
export function useNodePodCounts({
  clusterId,
  active,
  refreshSeconds,
}: {
  clusterId: string;
  active: boolean;
  refreshSeconds: number;
}): Map<string, number> {
  const [counts, setCounts] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!active) {
      setCounts(new Map());
      return;
    }
    let disposed = false;
    const load = async () => {
      const next = new Map<string, number>();
      let token: string | undefined;
      let pages = 0;
      try {
        do {
          const result = await call(
            api.resources.list({
              clusterId,
              apiVersion: "v1",
              kind: "Pod",
              limit: PAGE_LIMIT,
              continueToken: token,
            }),
          );
          if (disposed) return;
          for (const pod of result.items) {
            const node = pod.spec?.nodeName;
            if (typeof node === "string" && node) next.set(node, (next.get(node) ?? 0) + 1);
          }
          token = result.continueToken;
          pages += 1;
        } while (token && pages < MAX_PAGES);
        if (!disposed) setCounts(next);
      } catch {
        // Counts are an enhancement; on failure the cell falls back to "–"
        // instead of inventing zero.
      }
    };
    void load();
    const interval =
      refreshSeconds > 0
        ? window.setInterval(() => void load(), Math.max(30, refreshSeconds) * 1000)
        : null;
    return () => {
      disposed = true;
      if (interval) window.clearInterval(interval);
    };
  }, [active, clusterId, refreshSeconds]);

  return counts;
}
