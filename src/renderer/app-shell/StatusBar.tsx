import { useEffect, useState } from "react";
import { CircleCheck, CircleExclamationPoint, LoaderCircle } from "lucide-react";
import type { AppInfo, AppMetrics } from "@shared/types";
import { useCatalogStore } from "../stores/catalog-store";
import { useSessionStore } from "../stores/session-store";
import { api } from "../lib/api";
import { formatBytes } from "../lib/format";
import { cn } from "../lib/cn";

export function StatusBar({ activeClusterId }: { activeClusterId: string | null }) {
  const settings = useCatalogStore((state) => state.settings);
  const sources = useCatalogStore((state) => state.sources);
  const clusters = useCatalogStore((state) => state.clusters);
  const health = useCatalogStore((state) => state.health);
  // A14: only the two session fields the bar renders — not the whole session.
  const connected = useSessionStore(
    (state) => (activeClusterId ? state.sessions[activeClusterId]?.status === "connected" : false),
  );
  const activeContext = useSessionStore(
    (state) => (activeClusterId ? state.sessions[activeClusterId]?.info?.context : undefined),
  );
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [metrics, setMetrics] = useState<AppMetrics | null>(null);
  const showMetrics = settings?.showPerformanceMetrics ?? false;

  useEffect(() => {
    void api.app.info().then(setInfo).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!showMetrics) {
      setMetrics(null);
      return;
    }
    let disposed = false;
    const load = () => {
      if (document.hidden) return;
      void api.app
        .metrics()
        .then((usage) => {
          if (!disposed) setMetrics(usage);
        })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, 5_000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [showMetrics]);

  const activeCluster = clusters.find((cluster) => cluster.id === activeClusterId);
  const clusterHealth = activeClusterId ? health[activeClusterId] : undefined;

  return (
    <footer className="flex h-6 shrink-0 items-center gap-2 border-t border-theme-border bg-theme-base px-3 text-[calc(10px*var(--font-scale))] text-theme-text-tertiary">
      <span className="flex items-center gap-1">
        {connected ? (
          <CircleCheck className="h-2.5 w-2.5 text-emerald-500" />
        ) : clusterHealth?.status === "error" ? (
          <CircleExclamationPoint className="h-2.5 w-2.5 text-red-500" />
        ) : activeClusterId ? (
          <LoaderCircle className="h-2.5 w-2.5 animate-spin" />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-theme-text-disabled" />
        )}
        {activeCluster ? activeCluster.name : "No active cluster"}
        {connected && clusterHealth?.latencyMs ? (
          <span className="font-mono text-theme-text-disabled">{clusterHealth.latencyMs}ms</span>
        ) : null}
      </span>
      <span className="text-theme-text-disabled">·</span>
      <span>
        {clusters.length} contexts · {sources.length} kubeconfig{sources.length === 1 ? "" : "s"}
      </span>
      {settings && settings.refreshIntervalSeconds === 0 ? (
        <>
          <span className="text-theme-text-disabled">·</span>
          <span className="text-amber-600 dark:text-amber-400">Auto-refresh off</span>
        </>
      ) : null}

      <span className="ml-auto hidden items-center gap-2 sm:flex">
        {activeContext ? (
          <span className="max-w-[16rem] truncate font-mono text-theme-text-disabled">{activeContext}</span>
        ) : null}
        {metrics ? (
          <span className="whitespace-nowrap font-mono text-theme-text-tertiary" title="Total CPU and memory across mLens processes">
            CPU {metrics.cpuPercent.toFixed(1)}% · RAM {formatBytes(metrics.memoryBytes)}
          </span>
        ) : null}
        <span className={cn("text-theme-text-disabled")}>
          Electron {info?.electron ?? "—"} · Node {info?.node ?? "—"}
        </span>
        <span className="text-theme-text-secondary">mLens {info?.version ?? "v2.2.9"}</span>
      </span>
    </footer>
  );
}
