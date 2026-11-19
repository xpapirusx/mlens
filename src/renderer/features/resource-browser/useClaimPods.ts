import { useEffect, useMemo, useRef, useState } from "react";
import type { ApiResourceInfo, KubeObject } from "@shared/types";
import { api, call } from "../../lib/api";
import { sameStringList } from "../../lib/stable";

/**
 * Maps `${namespace}/${claimName}` → pod names that mount the claim. Only used
 * while a PersistentVolumeClaim table is on screen, so the extra Pod list costs
 * one request per namespace scope and nothing at all for other kinds.
 */
export function useClaimPods({
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
}): Map<string, string[]> {
  const [pods, setPods] = useState<KubeObject[]>([]);
  const stableRef = useRef<Map<string, string[]>>(new Map());
  const enabled = active && !resource?.isCrd && resource?.kind === "PersistentVolumeClaim";
  const scopeKey = namespaces.join("|");

  useEffect(() => {
    if (!enabled) {
      setPods([]);
      return;
    }
    let disposed = false;
    const load = async (quiet: boolean) => {
      if (!quiet) setPods([]);
      const scopes = namespaces.length ? namespaces : [undefined];
      const results = await Promise.allSettled(
        scopes.map((namespace) =>
          call(api.resources.list({ clusterId, apiVersion: "v1", kind: "Pod", namespace, limit: 1000 })),
        ),
      );
      if (disposed) return;
      const found: KubeObject[] = [];
      for (const result of results) {
        if (result.status === "fulfilled") found.push(...result.value.items);
      }
      setPods(found);
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
    const built = new Map<string, string[]>();
    for (const pod of pods) {
      const namespace = pod.metadata?.namespace ?? "";
      for (const volume of ((pod.spec?.volumes ?? []) as Array<Record<string, any>>)) {
        const claim = volume.persistentVolumeClaim?.claimName;
        if (!claim) continue;
        const key = `${namespace}/${claim}`;
        const list = built.get(key) ?? [];
        if (pod.metadata?.name && !list.includes(pod.metadata.name)) list.push(pod.metadata.name);
        built.set(key, list);
      }
    }
    // A13: unchanged content keeps the previous identity (see lib/stable.ts).
    const prev = stableRef.current;
    if (
      prev.size === built.size &&
      [...prev].every(([key, list]) => {
        const other = built.get(key);
        return other !== undefined && sameStringList(list, other);
      })
    ) {
      return prev;
    }
    stableRef.current = built;
    return built;
  }, [pods]);
}
