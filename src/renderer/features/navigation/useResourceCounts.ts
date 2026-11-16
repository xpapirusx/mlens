import { useEffect, useRef, useState } from "react";
import type { ApiResourceInfo, ResourceCountResult } from "@shared/types";
import { resourceCountKey } from "@shared/keys";
import { api, errorText } from "../../lib/api";

export interface ResourceCounts {
  counts: Record<string, ResourceCountResult>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Sidebar counts are fetched with limit=1 and `remainingItemCount`, so a
 * cluster with 100+ kinds costs 100 tiny list calls rather than full lists.
 */
export function useResourceCounts(options: {
  clusterId: string;
  namespace: string;
  resources: ApiResourceInfo[];
  refreshSeconds: number;
}): ResourceCounts {
  const { clusterId, namespace, resources, refreshSeconds } = options;
  const [counts, setCounts] = useState<Record<string, ResourceCountResult>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const generation = useRef(0);

  useEffect(() => {
    if (resources.length === 0) return;
    const current = ++generation.current;
    setLoading(true);
    setError(null);

    void api.resources
      .counts({
        clusterId,
        resources: resources.map((resource) => ({
          apiVersion: resource.apiVersion,
          kind: resource.kind,
          namespace: resource.namespaced && namespace !== "all" ? namespace : undefined,
        })),
      })
      .then((results) => {
        if (current !== generation.current) return;
        const next: Record<string, ResourceCountResult> = {};
        for (const result of results) next[result.key] = result;
        setCounts(next);
        setLoading(false);
      })
      .catch((countError) => {
        if (current !== generation.current) return;
        setError(errorText(countError));
        setLoading(false);
      });

    if (!refreshSeconds) return;
    const timer = window.setInterval(() => setNonce((value) => value + 1), refreshSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [clusterId, namespace, resources, refreshSeconds, nonce]);

  return {
    counts,
    loading,
    error,
    refresh: () => setNonce((value) => value + 1),
  };
}

export function countFor(
  counts: Record<string, ResourceCountResult>,
  clusterId: string,
  resource: ApiResourceInfo,
  namespace: string,
): number | null {
  const key = resourceCountKey(
    clusterId,
    resource.apiVersion,
    resource.kind,
    resource.namespaced && namespace !== "all" ? namespace : undefined,
  );
  const entry = counts[key];
  if (!entry || entry.error) return null;
  return entry.count;
}
