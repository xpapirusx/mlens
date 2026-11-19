import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Container,
  FileCode,
  Maximize2,
  Minimize2,
  SquareTerminal,
  X,
} from "lucide-react";
import { useSessionStore } from "../../stores/session-store";
import { useCatalogStore } from "../../stores/catalog-store";
import { cn } from "../../lib/cn";
import { TerminalView } from "./TerminalView";
import { YamlDockTab } from "./YamlDockTab";
import { TerminalLauncher, type TerminalMode } from "./TerminalLauncher";

export function TerminalDock({ clusterId, active }: { clusterId: string; active: boolean }) {
  // A14: the dock reads only its own slice — kindState/search writes above
  // no longer re-render every terminal.
  const dock = useSessionStore((state) => state.sessions[clusterId]?.dock);
  const openTerminal = useSessionStore((state) => state.openTerminal);
  const openYamlTab = useSessionStore((state) => state.openYamlTab);
  const closeTerminal = useSessionStore((state) => state.closeTerminal);
  const selectTerminal = useSessionStore((state) => state.selectTerminal);
  const setDock = useSessionStore((state) => state.setDock);
  const updateSettings = useCatalogStore((state) => state.updateSettings);

  const [resizing, setResizing] = useState(false);
  const [launcher, setLauncher] = useState<{ open: boolean; mode: TerminalMode }>({
    open: false,
    mode: "local",
  });
  const previousHeight = useRef<number | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  /** Viewport y of the dock's bottom edge (it sits above the status bar). */
  const dockBottom = useRef<number | null>(null);

  const openLauncher = (mode: TerminalMode) => setLauncher({ open: true, mode });

  useEffect(() => {
    if (!resizing) return;
    const bottom = dockBottom.current ?? sectionRef.current?.getBoundingClientRect().bottom ?? window.innerHeight;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

    const onMove = (event: PointerEvent) => {
      const next = bottom - event.clientY;
      setDock(clusterId, {
        height: Math.min(Math.max(160, next), Math.max(240, bottom - 120)),
        open: true,
      });
    };
    const onUp = () => {
      setResizing(false);
      const height = useSessionStore.getState().sessions[clusterId]?.dock.height;
      if (height) void updateSettings({ dockHeight: height });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("blur", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("blur", onUp);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [resizing, clusterId, setDock, updateSettings]);

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.shiftKey && event.key.toLowerCase() === "t") {
        event.preventDefault();
        openLauncher("local");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  if (!dock) return null;

  const activeTab = dock.tabs.find((tab) => tab.id === dock.activeTabId) ?? dock.tabs[0];
  const height = dock.open ? dock.height : 34;

  const maximize = () => {
    if (dock.open && dock.height > window.innerHeight - 260) {
      setDock(clusterId, { height: previousHeight.current ?? 340 });
      previousHeight.current = null;
    } else {
      previousHeight.current = dock.height;
      setDock(clusterId, { height: window.innerHeight - 220, open: true });
    }
  };

  return (
    <section
      ref={sectionRef}
      className="relative z-20 flex shrink-0 flex-col border-t border-theme-border bg-theme-base"
      style={{ height }}
      aria-label="Terminal dock"
    >
      {dock.open ? (
        // The grab band straddles the top border (4px outside, 4px inside) so
        // the dock resizes in both directions and stays clear of the 24px
        // header buttons that start 5px below the border.
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize terminal dock"
          data-resizing={resizing}
          className="group absolute -top-1 left-0 right-0 z-10 flex h-2 cursor-row-resize items-center"
          onPointerDown={(event) => {
            event.preventDefault();
            dockBottom.current = sectionRef.current?.getBoundingClientRect().bottom ?? null;
            event.currentTarget.setPointerCapture(event.pointerId);
            setResizing(true);
          }}
        >
          <span
            className={cn(
              "h-[2px] w-full transition-colors",
              resizing ? "bg-skyhook-500" : "bg-theme-border group-hover:bg-skyhook-500/70",
            )}
          />
        </div>
      ) : null}

      <div
        className="flex h-[34px] shrink-0 items-center gap-1 border-b border-theme-border bg-theme-surface px-2"
        onDoubleClick={() => setDock(clusterId, { open: !dock.open })}
      >
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {dock.tabs.length === 0 ? null : (
            dock.tabs.map((tab) => {
              const active = tab.id === activeTab?.id;
              return (
                <div
                  key={tab.id}
                  className="dock-tab group cursor-pointer"
                  data-active={active}
                  onClick={() => {
                    selectTerminal(clusterId, tab.id);
                    setDock(clusterId, { open: true });
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    setDock(clusterId, { open: !dock.open });
                  }}
                  title={tab.title}
                >
                  {tab.kind === "yaml" ? (
                    <FileCode className="h-3 w-3 shrink-0 text-theme-text-tertiary" />
                  ) : (
                    <SquareTerminal className="h-3 w-3 shrink-0 text-theme-text-tertiary" />
                  )}
                  <span className="truncate">{tab.title}</span>
                  <button
                    type="button"
                    className="ml-0.5 shrink-0 rounded p-0.5 text-theme-text-tertiary opacity-0 hover:bg-theme-hover hover:text-theme-text-primary group-hover:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      closeTerminal(clusterId, tab.id);
                    }}
                    aria-label={`Close ${tab.title}`}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-theme-border bg-theme-base/70 p-0.5">
          <button
            type="button"
            className="shell-icon-button h-6 w-6"
            title="New local terminal"
            aria-label="New local terminal"
            onClick={() => openTerminal(clusterId, { type: "local" })}
          >
            <SquareTerminal className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="shell-icon-button h-6 w-6"
            title="Pod exec in a chosen context"
            aria-label="Pod exec in a chosen context"
            onClick={() => openLauncher("pod")}
          >
            <Container className="h-3.5 w-3.5" />
          </button>
          <span className="mx-0.5 h-3.5 w-px bg-theme-border" />
          <button
            type="button"
            className="shell-icon-button h-6 w-6"
            title="Create resources from YAML"
            aria-label="Create resources from YAML"
            onClick={() => openYamlTab(clusterId)}
          >
            <FileCode className="h-3.5 w-3.5" />
          </button>
        </div>
        {dock.tabs.length > 0 ? (
          <>
            <button type="button" className="shell-icon-button h-6 w-6" title="Maximize dock" onClick={maximize}>
              {dock.height > window.innerHeight - 260 ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              type="button"
              className="shell-icon-button h-6 w-6"
              title={dock.open ? "Collapse dock" : "Expand dock"}
              onClick={() => setDock(clusterId, { open: !dock.open })}
            >
              {dock.open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            </button>
          </>
        ) : null}
      </div>

      {dock.open ? (
        <div className="relative min-h-0 flex-1 bg-[#0b1322]">
          {dock.tabs.length === 0 ? (
            <div className="flex h-full items-center justify-center p-4">
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/12 bg-white/[0.03] px-8 py-6">
                <SquareTerminal className="h-5 w-5 text-slate-500" />
                <div className="text-xs text-slate-400">No terminal sessions</div>
                <div className="flex items-stretch gap-2">
                  <button
                    type="button"
                    className="flex w-28 flex-col items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-2.5 text-[calc(11px*var(--font-scale))] text-slate-300 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-slate-100"
                    onClick={() => openTerminal(clusterId, { type: "local" })}
                  >
                    <SquareTerminal className="h-4 w-4" />
                    <span>Local terminal</span>
                  </button>
                  <button
                    type="button"
                    className="flex w-28 flex-col items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-2.5 text-[calc(11px*var(--font-scale))] text-slate-300 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-slate-100"
                    onClick={() => openLauncher("pod")}
                  >
                    <Container className="h-4 w-4" />
                    <span>Pod exec</span>
                  </button>
                  <button
                    type="button"
                    className="flex w-28 flex-col items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-2.5 text-[calc(11px*var(--font-scale))] text-slate-300 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-slate-100"
                    onClick={() => openYamlTab(clusterId)}
                  >
                    <FileCode className="h-4 w-4" />
                    <span>Resources from YAML</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            dock.tabs.map((tab) =>
              tab.kind === "yaml" ? (
                <YamlDockTab
                  key={tab.id}
                  clusterId={clusterId}
                  active={active && tab.id === activeTab?.id}
                />
              ) : (
                <TerminalView key={tab.id} target={tab.target} active={active && tab.id === activeTab?.id} />
              ),
            )
          )}
        </div>
      ) : null}

      <TerminalLauncher
        open={launcher.open}
        initialMode={launcher.mode}
        clusterId={clusterId}
        onClose={() => setLauncher((current) => ({ ...current, open: false }))}
        onLaunch={(target) => openTerminal(clusterId, target)}
      />
    </section>
  );
}
