import { useEffect, useRef, useState } from "react";
import type { ApiResourceInfo } from "@shared/types";
import { api, errorText } from "../../lib/api";

export type CountMap = Record<string, number | null>;

export interface ResourceCounts {
  counts: CountMap;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const countKey = (apiVersion: string, kind: string): string => `${apiVersion}|${kind}`;

/**
 * Sidebar counts use limit=1 + metadata.remainingItemCount, so a cluster with
 * 200 kinds costs 200 tiny calls instead of full lists. With several selected
 * namespaces each kind is counted per namespace and summed.
 */
export function useResourceCounts(options: {
  clusterId: string;
  namespaces: string[];
  resources: ApiResourceInfo[];
  refreshSeconds: number;
}): ResourceCounts {
  const { clusterId, namespaces, resources, refreshSeconds } = options;
  const [counts, setCounts] = useState<CountMap>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const generation = useRef(0);
  const scopeKey = [...namespaces].sort().join(",");

  useEffect(() => {
    if (resources.length === 0) return;
    const current = ++generation.current;
    setLoading(true);
    setError(null);

    const requests: Array<{ apiVersion: string; kind: string; namespace?: string }> = [];
    for (const resource of resources) {
      if (!resource.namespaced || namespaces.length === 0) {
        requests.push({ apiVersion: resource.apiVersion, kind: resource.kind });
      } else {
        for (const namespace of namespaces) {
          requests.push({ apiVersion: resource.apiVersion, kind: resource.kind, namespace });
        }
      }
    }

    void api.resources
      .counts({ clusterId, resources: requests })
      .then((results) => {
        if (current !== generation.current) return;
        const sums = new Map<string, { value: number; failed: boolean }>();
        for (const result of results) {
          const [clusterIdPart, apiVersion, kind, namespace] = result.key.split("|");
          if (clusterIdPart !== clusterId) continue;
          void namespace;
          const key = countKey(apiVersion, kind);
          const entry = sums.get(key) ?? { value: 0, failed: false };
          if (result.error) entry.failed = true;
          else entry.value += result.count;
          sums.set(key, entry);
        }
        const next: CountMap = {};
        for (const [key, entry] of sums) next[key] = entry.failed && entry.value === 0 ? null : entry.value;
        setCounts(next);
        setLoading(false);
      })
      .catch((countError) => {
        if (current !== generation.current) return;
        setError(errorText(countError));
        setLoading(false);
      });

    if (!refreshSeconds) return;
    const interval = Math.max(120, refreshSeconds) * 1000;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      setNonce((value) => value + 1);
    }, interval);
    return () => window.clearInterval(timer);
  }, [clusterId, resources, refreshSeconds, scopeKey, nonce]);

  return {
    counts,
    loading,
    error,
    refresh: () => setNonce((value) => value + 1),
  };
}

export function countFor(counts: CountMap, resource: ApiResourceInfo): number | null {
  return counts[countKey(resource.apiVersion, resource.kind)] ?? null;
}
