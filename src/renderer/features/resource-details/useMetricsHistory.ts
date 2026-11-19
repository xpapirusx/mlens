import { useEffect, useState } from "react";
import type { MetricsHistory } from "@shared/types";
import { api, call, errorText } from "../../lib/api";

/** The tab reads a cheap in-memory ring buffer in main; 15s is enough. */
const REFRESH_MS = 15_000;

export interface MetricsHistoryState {
  history: MetricsHistory | null;
  loading: boolean;
  error: string | null;
}

/**
 * Rolling metrics.k8s.io samples collected by main while the Metrics tab is in
 * use. The first read wakes the collector, so opening the tab gives one point
 * immediately and the chart grows every 30s — this is not Prometheus history.
 */
export function useMetricsHistory(options: {
  clusterId: string;
  kind: "Pod" | "Node" | string;
  namespace?: string;
  name: string;
  active: boolean;
}): MetricsHistoryState {
  const { clusterId, kind, namespace, name, active } = options;
  const [history, setHistory] = useState<MetricsHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supported = kind === "Pod" || kind === "Node";

  useEffect(() => {
    if (!active || !supported) {
      setLoading(false);
      return;
    }
    let disposed = false;
    setLoading(true);

    const load = async () => {
      try {
        const next = await call(
          api.metrics.history({
            clusterId,
            kind: kind === "Node" ? "Node" : "Pod",
            namespace: kind === "Pod" ? namespace : undefined,
            name,
          }),
        );
        if (disposed) return;
        setHistory(next);
        setError(null);
      } catch (fetchError) {
        if (!disposed) setError(errorText(fetchError));
      } finally {
        if (!disposed) setLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, REFRESH_MS);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [active, clusterId, kind, name, namespace, supported]);

  return { history, loading, error };
}
