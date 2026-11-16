import { useEffect, useState } from "react";
import { Server, ServerCrash } from "lucide-react";
import { useCatalogStore } from "../../stores/catalog-store";
import { useSessionStore } from "../../stores/session-store";
import { ResourceSidebar } from "../../features/navigation/ResourceSidebar";
import { PageTabs } from "../../features/resource-browser/PageTabs";
import { ResourceBrowser } from "../../features/resource-browser/ResourceBrowser";
import { ResourceDetails } from "../../features/resource-details/ResourceDetails";
import { TerminalDock } from "../../features/terminal/TerminalDock";
import { Spinner } from "../../design-system/components/Spinner";
import { Button } from "../../design-system/components/Button";
import { EmptyState } from "../../design-system/components/EmptyState";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";

export function ClusterWorkspace({ clusterId }: { clusterId: string }) {
  const session = useSessionStore((state) => state.sessions[clusterId]);
  const initialize = useSessionStore((state) => state.initialize);
  const dispose = useSessionStore((state) => state.dispose);
  const setSidebarWidth = useSessionStore((state) => state.setSidebarWidth);
  const settings = useCatalogStore((state) => state.settings);
  const updateSettings = useCatalogStore((state) => state.updateSettings);
  const clusters = useCatalogStore((state) => state.clusters);
  const setActiveCluster = useCatalogStore((state) => state.setActiveCluster);
  const [resizing, setResizing] = useState(false);

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
      <div className="flex flex-1 items-center justify-center bg-theme-base">
        <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-xl border border-theme-border bg-theme-surface p-8 shadow-theme-md">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-skyhook-500 to-skyhook-800 text-white shadow-theme-md">
            <Server className="h-5 w-5" />
          </div>
          <div className="text-center">
            <div className="text-[15px] font-semibold text-theme-text-primary">{cluster?.name ?? "Cluster"}</div>
            <div className="mt-0.5 font-mono text-[11px] text-theme-text-tertiary">{cluster?.context}</div>
          </div>
          <Spinner label="Connecting, discovering API resources and namespaces…" />
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
      <ResourceSidebar cluster={cluster} clusterId={clusterId} width={width} />
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
      <div className="flex min-w-0 flex-1 flex-col">
        <PageTabs clusterId={clusterId} resources={session.resources} />
        <div className="relative flex min-h-0 flex-1">
          <ResourceBrowser clusterId={clusterId} />
          <ResourceDetails clusterId={clusterId} />
        </div>
        <TerminalDock clusterId={clusterId} />
      </div>
    </div>
  );
}
