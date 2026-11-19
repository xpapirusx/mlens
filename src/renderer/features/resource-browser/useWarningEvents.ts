import { useEffect, useMemo, useRef, useState } from "react";
import type { KubeObject } from "@shared/types";
import { api, call } from "../../lib/api";

export interface WarningEntry {
  count: number;
  message: string;
  reason?: string;
  at?: string;
}

/**
 * Latest Warning event per object, keyed `${namespace}/${name}` — the data
 * behind the table's Warnings column (Freelens' pods-warning column). Fetched
 * only while a kind that has the column is on screen: one `type=Warning` event
 * list per namespace scope.
 */
export function useWarningEvents({
  clusterId,
  namespaces,
  active,
  refreshSeconds,
}: {
  clusterId: string;
  namespaces: string[];
  active: boolean;
  refreshSeconds: number;
}): Map<string, WarningEntry> {
  const [events, setEvents] = useState<KubeObject[]>([]);
  const stableRef = useRef<Map<string, WarningEntry>>(new Map());
  const enabled = active;
  const scopeKey = namespaces.join("|");

  useEffect(() => {
    if (!enabled) {
      setEvents([]);
      return;
    }
    let disposed = false;
    const load = async (quiet: boolean) => {
      if (!quiet) setEvents([]);
      const scopes = namespaces.length ? namespaces : [undefined];
      const results = await Promise.allSettled(
        scopes.map((namespace) =>
          call(
            api.resources.list({
              clusterId,
              apiVersion: "v1",
              kind: "Event",
              namespace,
              fieldSelector: "type=Warning",
              limit: 1000,
            }),
          ),
        ),
      );
      if (disposed) return;
      const found: KubeObject[] = [];
      for (const result of results) {
        if (result.status === "fulfilled") found.push(...result.value.items);
      }
      setEvents(found);
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
    const built = new Map<string, WarningEntry>();
    const stamp = (event: KubeObject): number => {
      const value =
        (event.lastTimestamp as string | undefined) ??
        (event.eventTime as string | undefined) ??
        (event.series as { lastObservedTime?: string } | undefined)?.lastObservedTime ??
        event.metadata?.creationTimestamp;
      const parsed = value ? Date.parse(value) : NaN;
      return Number.isFinite(parsed) ? parsed : 0;
    };
    for (const event of events) {
      const involved = event.involvedObject as
        | { namespace?: string; name?: string; kind?: string; uid?: string }
        | undefined;
      if (!involved?.name) continue;
      const key = involved.uid ?? `${involved.namespace ?? ""}/${involved.name}`;
      const at = stamp(event);
      const current = built.get(key);
      if (current && (current.at ?? "") >= String(at)) {
        current.count += 1;
        continue;
      }
      built.set(key, {
        count: (current?.count ?? 0) + 1,
        message: String(event.message ?? ""),
        reason: event.reason as string | undefined,
        at: String(at),
      });
    }
    // A13: keep the previous map identity while the content is unchanged, so
    // the 30s warning poll stops invalidating `cellContext` downstream.
    const prev = stableRef.current;
    if (
      prev.size === built.size &&
      [...prev].every(([key, entry]) => {
        const other = built.get(key);
        return (
          other !== undefined &&
          other.count === entry.count &&
          other.message === entry.message &&
          other.reason === entry.reason &&
          other.at === entry.at
        );
      })
    ) {
      return prev;
    }
    stableRef.current = built;
    return built;
  }, [events]);
}
