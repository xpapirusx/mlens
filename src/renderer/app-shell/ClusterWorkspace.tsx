import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiResourceInfo } from "@shared/types";
import { Check, LoaderCircle, Server, ServerCrash } from "lucide-react";
import { useCatalogStore } from "../stores/catalog-store";
import {
  hasEditorTab,
  useSessionStore,
} from "../stores/session-store";
import { ResourceSidebar } from "../features/navigation/ResourceSidebar";
import { PageTabs } from "../features/resource-browser/PageTabs";
import { EditorTray } from "../features/resource-details/ResourceTabs";
import { EditorArea } from "../features/editor/EditorArea";
import { ResourceBrowser } from "../features/resource-browser/ResourceBrowser";
import { TerminalDock } from "../features/terminal/TerminalDock";
import { Button } from "../design-system/components/Button";
import { EmptyState } from "../design-system/components/EmptyState";
import { cn } from "../lib/cn";

const CONNECT_STEPS = [
  { key: "api", label: "Contacting the API server" },
  { key: "namespaces", label: "Loading namespaces" },
  { key: "discovery", label: "Discovering API resources" },
] as const;

// Stable fallback: selector results must keep their identity (React #185).
const EMPTY_RESOURCES: ApiResourceInfo[] = [];

export function ClusterWorkspace({ clusterId, active }: { clusterId: string; active: boolean }) {
  // A14: field-level session selectors — dock/drawer/kindState writes from
  // other components no longer re-render the whole workspace subtree.
  const status = useSessionStore((state) => state.sessions[clusterId]?.status);
  const connectStage = useSessionStore((state) => state.sessions[clusterId]?.connectStage);
  const connectPercent = useSessionStore((state) => state.sessions[clusterId]?.connectPercent);
  const connectError = useSessionStore((state) => state.sessions[clusterId]?.error);
  const sidebarWidth = useSessionStore((state) => state.sessions[clusterId]?.sidebarWidth);
  const resources = useSessionStore((state) => state.sessions[clusterId]?.resources) ?? EMPTY_RESOURCES;
  const editorMinimized = useSessionStore(
    (state) => state.sessions[clusterId]?.editor.minimized ?? false,
  );
  const hasTabs = useSessionStore((state) => hasEditorTab(state.sessions[clusterId]));
  const initialize = useSessionStore((state) => state.initialize);
  const dispose = useSessionStore((state) => state.dispose);
  const setSidebarWidth = useSessionStore((state) => state.setSidebarWidth);
  const settings = useCatalogStore((state) => state.settings);
  const updateSettings = useCatalogStore((state) => state.updateSettings);
  const clusters = useCatalogStore((state) => state.clusters);
  const setActiveCluster = useCatalogStore((state) => state.setActiveCluster);
  const [resizing, setResizing] = useState(false);
  const [editorExpanded, setEditorExpanded] = useState(false);
  const toggleEditorExpanded = useCallback(() => setEditorExpanded((value) => !value), []);
  /** A15: the width being dragged — written to the DOM directly (no store
   *  write per pointermove), committed to the store once on pointerup. */
  const pendingWidth = useRef<number | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    void initialize(clusterId);
  }, [clusterId, initialize]);

  useEffect(() => {
    if (!resizing) return;
    const onMove = (event: PointerEvent) => {
      const next = Math.min(Math.max(180, event.clientX - 75), 420);
      pendingWidth.current = next;
      if (sidebarRef.current) sidebarRef.current.style.width = `${next}px`;
    };
    const onUp = () => {
      setResizing(false);
      const final = pendingWidth.current;
      pendingWidth.current = null;
      if (final === null) return;
      setSidebarWidth(clusterId, final);
      void updateSettings({ sidebarWidth: final });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [resizing, clusterId, setSidebarWidth, updateSettings]);

  const width = sidebarWidth ?? settings?.sidebarWidth ?? 236;
  const sidebarCollapsed = settings?.sidebarCollapsed ?? false;
  const cluster = clusters.find((entry) => entry.id === clusterId);
  const stage = connectStage ?? "api";
  const percent = Math.max(0, Math.min(100, Math.round(connectPercent ?? 5)));
  const stepIndex =
    stage === "done"
      ? CONNECT_STEPS.length
      : Math.max(0, CONNECT_STEPS.findIndex((step) => step.key === stage));

  if (!status || status === "connecting" || status === "idle") {
    return (
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-theme-base">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(74,124,201,0.12),transparent_55%)]" />
        <div className="relative flex w-full max-w-lg flex-col items-center gap-4 rounded-xl border border-theme-border bg-theme-surface p-8 shadow-theme-md">
          <div className="relative flex h-14 w-14 items-center justify-center">
            <span className="absolute -inset-1.5 rounded-full border border-skyhook-500/20" />
            <span className="absolute -inset-1.5 animate-spin rounded-full border-2 border-transparent border-t-skyhook-500" />
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-skyhook-500 to-skyhook-800 text-white shadow-theme-md">
              <Server className="h-5 w-5" />
            </div>
          </div>
          <div className="text-center">
            <div className="text-[calc(16px*var(--font-scale))] font-semibold text-theme-text-primary">
              Connecting to {cluster?.name ?? "cluster"}
            </div>
            <div className="mt-0.5 font-mono text-[calc(11px*var(--font-scale))] text-theme-text-tertiary">{cluster?.context}</div>
            {cluster?.server ? (
              <div className="mt-0.5 w-full break-all text-center font-mono text-[calc(10px*var(--font-scale))] text-theme-text-disabled">
                {cluster.server}
              </div>
            ) : null}
          </div>
          <div className="relative h-1 w-full overflow-hidden rounded-full bg-theme-elevated">
            <div
              className="h-full rounded-full bg-skyhook-500 transition-[width] duration-300 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="w-full space-y-1.5 text-[calc(11px*var(--font-scale))] text-theme-text-tertiary">
            {CONNECT_STEPS.map((step, index) => {
              const done = index < stepIndex;
              const current = index === stepIndex && stage !== "done";
              return (
                <div key={step.key} className="flex items-center gap-2">
                  <span className="flex h-3 w-3 shrink-0 items-center justify-center">
                    {done ? (
                      <Check className="h-3 w-3 text-emerald-500" />
                    ) : current ? (
                      <LoaderCircle className="h-3 w-3 animate-spin text-skyhook-500" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-theme-text-disabled/40" />
                    )}
                  </span>
                  <span
                    className={
                      done
                        ? "text-theme-text-secondary"
                        : current
                          ? "text-theme-text-primary"
                          : "text-theme-text-disabled"
                    }
                  >
                    {step.label}
                  </span>
                  {done ? (
                    <span className="ml-auto font-mono text-[calc(10px*var(--font-scale))] text-emerald-500">done</span>
                  ) : current ? (
                    <span className="ml-auto font-mono text-[calc(10px*var(--font-scale))] text-theme-text-disabled">loading…</span>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="flex w-full items-center justify-between">
            <span className="font-mono text-[calc(11px*var(--font-scale))] text-theme-text-tertiary">{percent}%</span>
            <Button variant="ghost" size="sm" onClick={() => setActiveCluster(null)}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-1 items-center justify-center bg-theme-base">
        <EmptyState
          icon={<ServerCrash />}
          title={`Cannot connect to ${cluster?.name ?? "cluster"}`}
          description={connectError}
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
      <ResourceSidebar cluster={cluster} clusterId={clusterId} width={width} active={active} rootRef={sidebarRef} />
      {!sidebarCollapsed ? (
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
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <PageTabs clusterId={clusterId} resources={resources} />
        <ResourceBrowser
          clusterId={clusterId}
          active={active}
          side={
            <EditorArea
              clusterId={clusterId}
              active={active}
              expanded={editorExpanded && hasTabs}
              onToggleExpanded={toggleEditorExpanded}
            />
          }
        />
        {editorMinimized && hasTabs ? <EditorTray clusterId={clusterId} /> : null}
        <TerminalDock clusterId={clusterId} active={active} />
      </div>
    </div>
  );
}
