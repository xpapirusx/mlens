import { useEffect, useState } from "react";
import { Server, ServerCrash } from "lucide-react";
import { useCatalogStore } from "../stores/catalog-store";
import { useSessionStore } from "../stores/session-store";
import { ResourceSidebar } from "../features/navigation/ResourceSidebar";
import { PageTabs } from "../features/resource-browser/PageTabs";
import { ResourceTabs, ResourceTabsTray } from "../features/resource-details/ResourceTabs";
import { ResourceBrowser } from "../features/resource-browser/ResourceBrowser";
import { ResourceDetails } from "../features/resource-details/ResourceDetails";
import { TerminalDock } from "../features/terminal/TerminalDock";
import { Button } from "../design-system/components/Button";
import { EmptyState } from "../design-system/components/EmptyState";
import { cn } from "../lib/cn";

export function ClusterWorkspace({ clusterId, active }: { clusterId: string; active: boolean }) {
  const session = useSessionStore((state) => state.sessions[clusterId]);
  const initialize = useSessionStore((state) => state.initialize);
  const dispose = useSessionStore((state) => state.dispose);
  const setSidebarWidth = useSessionStore((state) => state.setSidebarWidth);
  const settings = useCatalogStore((state) => state.settings);
  const updateSettings = useCatalogStore((state) => state.updateSettings);
  const clusters = useCatalogStore((state) => state.clusters);
  const setActiveCluster = useCatalogStore((state) => state.setActiveCluster);
  const [resizing, setResizing] = useState(false);
  const [tabsCollapsed, setTabsCollapsed] = useState(false);

  useEffect(() => {
    void initialize(clusterId);
  }, [clusterId, initialize]);

  useEffect(() => {
    if (!resizing) return;
    const onMove = (event: PointerEvent) => {
      const next = Math.min(Math.max(180, event.clientX - 54), 420);
      setSidebarWidth(clusterId, next);
    };
    const onUp = () => {
      setResizing(false);
      const width = useSessionStore.getState().sessions[clusterId]?.sidebarWidth;
      if (width) void updateSettings({ sidebarWidth: width });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [resizing, clusterId, setSidebarWidth, updateSettings]);

  const width = session?.sidebarWidth ?? settings?.sidebarWidth ?? 236;
  const cluster = clusters.find((entry) => entry.id === clusterId);

  if (!session || session.status === "connecting" || session.status === "idle") {
    return (
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-theme-base">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(74,124,201,0.12),transparent_55%)]" />
        <div className="relative flex w-full max-w-md flex-col items-center gap-4 rounded-xl border border-theme-border bg-theme-surface p-8 shadow-theme-md">
          <div className="relative flex h-14 w-14 items-center justify-center">
            <span className="absolute -inset-1.5 rounded-2xl border border-skyhook-500/20" />
            <span className="absolute -inset-1.5 animate-spin rounded-2xl border-2 border-transparent border-t-skyhook-500" />
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-skyhook-500 to-skyhook-800 text-white shadow-theme-md">
              <Server className="h-5 w-5" />
            </div>
          </div>
          <div className="text-center">
            <div className="text-[16px] font-semibold text-theme-text-primary">
              Connecting to {cluster?.name ?? "cluster"}
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-theme-text-tertiary">{cluster?.context}</div>
            {cluster?.server ? (
              <div className="mt-0.5 max-w-xs truncate font-mono text-[10px] text-theme-text-disabled">
                {cluster.server}
              </div>
            ) : null}
          </div>
          <div className="relative h-1 w-full overflow-hidden rounded-full bg-theme-elevated">
            <div className="loading-sweep h-full w-1/3 rounded-full bg-skyhook-500" />
          </div>
          <div className="w-full space-y-1.5 text-[11px] text-theme-text-tertiary">
            {["Contacting the API server", "Loading namespaces", "Discovering API resources"].map((step, index) => (
              <div key={step} className="flex items-center gap-2">
                <span
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-skyhook-500"
                  style={{ animationDelay: `${index * 220}ms` }}
                />
                {step}
                <span className="ml-auto font-mono text-[10px] text-theme-text-disabled">…</span>
              </div>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setActiveCluster(null)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (session.status === "error") {
    return (
      <div className="flex flex-1 items-center justify-center bg-theme-base">
        <EmptyState
          icon={<ServerCrash />}
          title={`Cannot connect to ${cluster?.name ?? "cluster"}`}
          description={session.error}
          action={
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setActiveCluster(null)}>
                Back to catalog
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  dispose(clusterId);
                  void initialize(clusterId);
                }}
              >
                Retry connection
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <ResourceSidebar cluster={cluster} clusterId={clusterId} width={width} active={active} />
      <div
        role="separator"
        aria-orientation="vertical"
        className={cn("shell-resize-handle-x shrink-0", resizing && "bg-skyhook-500/50")}
        data-resizing={resizing}
        onPointerDown={(event) => {
          event.preventDefault();
          setResizing(true);
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!tabsCollapsed ? (
          <ResourceTabs clusterId={clusterId} onCollapse={() => setTabsCollapsed(true)} />
        ) : null}
        <PageTabs clusterId={clusterId} resources={session.resources} />
        <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <ResourceBrowser clusterId={clusterId} active={active} />
          <ResourceDetails clusterId={clusterId} />
        </div>
        {tabsCollapsed ? (
          <ResourceTabsTray clusterId={clusterId} onExpand={() => setTabsCollapsed(false)} />
        ) : null}
        <TerminalDock clusterId={clusterId} active={active} />
      </div>
    </div>
  );
}
