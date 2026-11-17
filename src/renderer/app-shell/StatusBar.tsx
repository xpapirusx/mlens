import { useEffect, useState } from "react";
import { CircleCheck, CircleExclamationPoint, LoaderCircle } from "lucide-react";
import type { AppInfo } from "@shared/types";
import { useCatalogStore } from "../stores/catalog-store";
import { useSessionStore } from "../stores/session-store";
import { api } from "../lib/api";
import { cn } from "../lib/cn";

export function StatusBar({ activeClusterId }: { activeClusterId: string | null }) {
  const settings = useCatalogStore((state) => state.settings);
  const sources = useCatalogStore((state) => state.sources);
  const clusters = useCatalogStore((state) => state.clusters);
  const health = useCatalogStore((state) => state.health);
  const session = useSessionStore((state) => (activeClusterId ? state.sessions[activeClusterId] : undefined));
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    void api.app.info().then(setInfo).catch(() => undefined);
  }, []);

  const activeCluster = clusters.find((cluster) => cluster.id === activeClusterId);
  const clusterHealth = activeClusterId ? health[activeClusterId] : undefined;
  const connected = session?.status === "connected";

  return (
    <footer className="flex h-6 shrink-0 items-center gap-2 border-t border-theme-border bg-theme-base px-3 text-[10px] text-theme-text-tertiary">
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
        {session?.info?.context ? (
          <span className="max-w-[16rem] truncate font-mono text-theme-text-disabled">{session.info.context}</span>
        ) : null}
        <span className={cn("text-theme-text-disabled")}>
          Electron {info?.electron ?? "—"} · Node {info?.node ?? "—"}
        </span>
        <span className="text-theme-text-secondary">mLens {info?.version ?? "v2.2.9"}</span>
      </span>
    </footer>
  );
}
