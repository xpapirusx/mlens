import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  FileCode,
  Maximize2,
  Minimize2,
  Monitor,
  Plus,
  SquareTerminal,
  X,
} from "lucide-react";
import { useSessionStore } from "../../stores/session-store";
import { useCatalogStore } from "../../stores/catalog-store";
import { Menu, MenuItem } from "../../design-system/components/Menu";
import { TerminalView } from "./TerminalView";
import { YamlDockTab } from "./YamlDockTab";
import { TerminalLauncher, type TerminalMode } from "./TerminalLauncher";

export function TerminalDock({ clusterId, active }: { clusterId: string; active: boolean }) {
  const session = useSessionStore((state) => state.sessions[clusterId]);
  const openTerminal = useSessionStore((state) => state.openTerminal);
  const openYamlTab = useSessionStore((state) => state.openYamlTab);
  const closeTerminal = useSessionStore((state) => state.closeTerminal);
  const selectTerminal = useSessionStore((state) => state.selectTerminal);
  const setDock = useSessionStore((state) => state.setDock);
  const updateSettings = useCatalogStore((state) => state.updateSettings);

  const dock = session?.dock;
  const [resizing, setResizing] = useState(false);
  const [launcher, setLauncher] = useState<{ open: boolean; mode: TerminalMode }>({
    open: false,
    mode: "local",
  });
  const previousHeight = useRef<number | null>(null);

  const openLauncher = (mode: TerminalMode) => setLauncher({ open: true, mode });

  useEffect(() => {
    if (!resizing) return;
    const onMove = (event: PointerEvent) => {
      const next = window.innerHeight - event.clientY;
      setDock(clusterId, {
        height: Math.min(Math.max(140, next), window.innerHeight - 180),
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
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
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
      className="relative z-20 flex shrink-0 flex-col border-t border-theme-border bg-theme-base"
      style={{ height }}
      aria-label="Terminal dock"
    >
      {dock.open ? (
        <div
          role="separator"
          aria-orientation="horizontal"
          // Starts exactly at the dock's top border line (the section's
          // border sits outside its padding box, so -top-px == the line) and
          // reaches 5px into the 34px strip — clear of the 24px buttons.
          className="app-no-drag absolute -top-px left-0 right-0 z-10 h-1.5 cursor-row-resize"
          onPointerDown={(event) => {
            event.preventDefault();
            setResizing(true);
          }}
        />
      ) : null}

      <div
        className="flex h-[34px] shrink-0 items-center gap-1 border-b border-theme-border bg-theme-surface px-2"
        onDoubleClick={() => setDock(clusterId, { open: !dock.open })}
      >
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {dock.tabs.length === 0 ? (
            <span className="px-1 text-[11px] text-theme-text-tertiary">Terminal</span>
          ) : (
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

        <button
          type="button"
          className="shell-icon-button h-6 w-6"
          title="New local terminal"
          onClick={() => openTerminal(clusterId, { type: "local" })}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <Menu
          align="end"
          side="top"
          width={214}
          trigger={({ toggle }) => (
            <button
              type="button"
              className="shell-icon-button h-6 w-4"
              title="New terminal in a chosen context"
              aria-label="New terminal in a chosen context"
              onClick={toggle}
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          )}
        >
          {({ close }) => (
            <>
              <MenuItem
                icon={<Monitor className="h-3.5 w-3.5" />}
                onClick={() => {
                  close();
                  openLauncher("local");
                }}
              >
                Local terminal…
              </MenuItem>
              <MenuItem
                icon={<SquareTerminal className="h-3.5 w-3.5" />}
                onClick={() => {
                  close();
                  openLauncher("pod");
                }}
              >
                Pod exec…
              </MenuItem>
            </>
          )}
        </Menu>
        <button
          type="button"
          className="shell-icon-button h-6 w-6"
          title="Create resources from YAML"
          aria-label="Create resources from YAML"
          onClick={() => openYamlTab(clusterId)}
        >
          <FileCode className="h-3.5 w-3.5" />
        </button>
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
            <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
              <SquareTerminal className="h-5 w-5" />
              <div className="text-xs">No terminal sessions</div>
              <button
                type="button"
                className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-slate-200 hover:bg-white/10"
                onClick={() => openTerminal(clusterId, { type: "local" })}
              >
                New local terminal
              </button>
              <button
                type="button"
                className="rounded-md px-2.5 py-1 text-[11px] text-slate-400 hover:bg-white/5 hover:text-slate-200"
                onClick={() => openLauncher("pod")}
              >
                Pod exec in another context…
              </button>
              <button
                type="button"
                className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-slate-200 hover:bg-white/10"
                onClick={() => openYamlTab(clusterId)}
              >
                Create resources from YAML
              </button>
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
