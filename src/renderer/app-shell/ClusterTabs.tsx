import { ArrowLeft, ArrowRight, Blocks, Home, Plus, X } from "lucide-react";
import { useCatalogStore } from "../stores/catalog-store";
import { useSessionStore } from "../stores/session-store";
import { disconnectCluster } from "../lib/cluster-actions";
import { cn } from "../lib/cn";

export function ClusterTabs() {
  const sessions = useSessionStore((state) => state.sessions);
  const activeClusterId = useCatalogStore((state) => state.activeClusterId);
  const setActiveCluster = useCatalogStore((state) => state.setActiveCluster);
  const clusters = useCatalogStore((state) => state.clusters);
  const detailsBack = useSessionStore((state) => state.detailsBack);
  const closeDetails = useSessionStore((state) => state.closeDetails);

  const ids = Object.keys(sessions);
  const activeSession = activeClusterId ? sessions[activeClusterId] : undefined;
  const details = activeSession?.details ?? null;
  const detailsHistory = activeSession?.detailsHistory ?? [];

  const goBack = () => {
    if (activeClusterId && details) {
      if (detailsHistory.length > 0) detailsBack(activeClusterId);
      else closeDetails(activeClusterId);
      return;
    }
    if (activeClusterId) setActiveCluster(null);
  };

  const closeTab = async (id: string) => {
    const next = ids.find((entry) => entry !== id);
    await disconnectCluster(id);
    if (activeClusterId === id) {
      setActiveCluster(next ?? null);
    }
  };

  return (
    <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-theme-border bg-theme-sidebar px-2">
      <div className="flex shrink-0 items-center gap-0.1 border-r border-theme-border pr-1">
        <button
          type="button"
          className="shell-icon-button h-6 w-6"
          title="Catalog (home)"
          aria-label="Catalog"
          onClick={() => setActiveCluster(null)}
        >
          <Home className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="shell-icon-button h-6 w-6 disabled:opacity-30"
          title={details ? "Back to previous resource" : "Back to catalog"}
          aria-label="Back"
          disabled={!activeClusterId}
          onClick={goBack}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="shell-icon-button h-6 w-6 disabled:opacity-30"
          title="Forward navigation is not implemented yet"
          aria-label="Forward"
          disabled
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
      {ids.length === 0 ? (
        <span className="px-2 text-[11px] text-theme-text-tertiary">Catalog</span>
      ) : null}
      {ids.map((id) => {
        const session = sessions[id];
        const cluster = clusters.find((entry) => entry.id === id);
        const active = id === activeClusterId;
        return (
          <div
            key={id}
            className={cn(
              "group/tab flex h-7 max-w-[15rem] shrink-0 items-center gap-1.5 rounded-md border px-2 text-[11px] transition-colors",
              active
                ? "border-theme-border bg-theme-surface text-theme-text-primary shadow-theme-sm"
                : "border-transparent text-theme-text-tertiary hover:bg-theme-hover/60 hover:text-theme-text-secondary",
            )}
          >
            <button
              type="button"
              className="flex min-w-0 items-center gap-1.5"
              onClick={() => setActiveCluster(id)}
              title={`${cluster?.name ?? id}\n${session.info?.context ?? ""}`}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  session.status === "connected"
                    ? "bg-emerald-500"
                    : session.status === "error"
                      ? "bg-red-500"
                      : "animate-pulse bg-amber-500",
                )}
              />
              <span className="truncate">{cluster?.name ?? session.info?.name ?? id.split("::").pop()}</span>
            </button>
            <button
              type="button"
              className="shrink-0 rounded p-0.5 text-theme-text-tertiary opacity-0 hover:bg-theme-hover hover:text-red-500 group-hover/tab:opacity-100"
              title="Disconnect and close cluster tab"
              onClick={() => void closeTab(id)}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className="shell-icon-button h-6 w-6 shrink-0"
        title="Open another cluster from the catalog"
        onClick={() => setActiveCluster(null)}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      <div className="ml-auto flex items-center gap-1 pl-2 text-[10px] text-theme-text-disabled">
        <Blocks className="h-3 w-3" />
        {ids.length} open
      </div>
    </div>
  );
}
