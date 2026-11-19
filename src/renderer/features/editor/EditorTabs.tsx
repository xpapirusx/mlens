import { useRef, useState } from "react";
import type { ResourceKey } from "@shared/types";
import { Columns2, MoreHorizontal, Rows2, X } from "lucide-react";
import {
  sameRef,
  useSessionStore,
  type EditorPaneState,
} from "../../stores/session-store";
import { getKindIcon } from "../../lib/icons";
import { cn } from "../../lib/cn";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "../../design-system/components/Menu";
import { ContextMenu } from "../../design-system/components/ContextMenu";

const DRAG_MIME = "application/x-mlens-tab";

interface DragPayload {
  paneId: string;
  ref: ResourceKey;
}

function tabKey(ref: ResourceKey): string {
  return `${ref.apiVersion}|${ref.kind}|${ref.namespace ?? ""}|${ref.name}`;
}

/**
 * VS Code-like tab strip for one editor pane: drag to reorder, drop onto
 * another pane to move the tab, middle-click to close, right-click for
 * Close/Close others/Close to the right/Split.
 */
export function EditorTabs({ clusterId, pane }: { clusterId: string; pane: EditorPaneState }) {
  const resources = useSessionStore(
    (state) => state.sessions[clusterId]?.resources ?? EMPTY_RESOURCES,
  );
  const panes = useSessionStore(
    (state) => state.sessions[clusterId]?.editor.panes ?? EMPTY_PANES,
  );
  const activateResource = useSessionStore((state) => state.activateResource);
  const setActivePane = useSessionStore((state) => state.setActivePane);
  const closePaneTab = useSessionStore((state) => state.closePaneTab);
  const closeOtherPaneTabs = useSessionStore((state) => state.closeOtherPaneTabs);
  const closePaneTabsToRight = useSessionStore((state) => state.closePaneTabsToRight);
  const reorderTab = useSessionStore((state) => state.reorderTab);
  const moveTab = useSessionStore((state) => state.moveTab);
  const openDetailsInNewPane = useSessionStore((state) => state.openDetailsInNewPane);

  const [menu, setMenu] = useState<{ x: number; y: number; ref: ResourceKey } | null>(null);
  const drag = useRef<DragPayload | null>(null);

  const canSplitRight = pane.slot % 2 === 0 && !panes.some((entry) => entry.slot === pane.slot + 1);
  const canSplitDown = pane.slot < 2 && !panes.some((entry) => entry.slot === pane.slot + 2);
  const otherPanes = panes.filter((entry) => entry.id !== pane.id);
  const menuIndex = menu ? pane.tabs.findIndex((tab) => sameRef(tab, menu.ref)) : -1;
  const canCloseRight = menuIndex >= 0 && menuIndex < pane.tabs.length - 1;

  const startDrag = (event: React.DragEvent, ref: ResourceKey) => {
    drag.current = { paneId: pane.id, ref };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(DRAG_MIME, JSON.stringify({ paneId: pane.id, ref }));
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    let payload: DragPayload | null = drag.current;
    try {
      const raw = event.dataTransfer.getData(DRAG_MIME);
      if (raw) payload = JSON.parse(raw) as DragPayload;
    } catch {
      payload = drag.current;
    }
    drag.current = null;
    if (!payload) return;
    if (payload.paneId === pane.id) {
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-tab-index]");
      const index = target ? Number(target.dataset.tabIndex) : pane.tabs.length;
      reorderTab(clusterId, pane.id, payload.ref, index);
      return;
    }
    moveTab(clusterId, payload.paneId, pane.id, payload.ref);
  };

  const closeMenu = () => setMenu(null);

  return (
    <div
      className="flex h-10 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-theme-border bg-theme-base px-1"
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={onDrop}
      onPointerDown={() => setActivePane(clusterId, pane.id)}
    >
      {pane.tabs.map((tab, index) => {
        const isActive = pane.active !== null && sameRef(pane.active, tab);
        const info = resources.find(
          (entry) => entry.apiVersion === tab.apiVersion && entry.kind === tab.kind,
        );
        const Icon = getKindIcon(tab.kind, info?.group);
        return (
          <div
            key={tabKey(tab)}
            data-tab-index={index}
            draggable
            onDragStart={(event) => startDrag(event, tab)}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenu({ x: event.clientX, y: event.clientY, ref: tab });
            }}
            onAuxClick={(event) => {
              if (event.button === 1) closePaneTab(clusterId, pane.id, tab);
            }}
            title={`${tab.kind}/${tab.name}${tab.namespace ? ` · ${tab.namespace}` : ""}`}
            className={cn(
              "group/tab relative flex h-7 max-w-[14rem] shrink-0 items-center gap-1 rounded-t border border-b-0 px-2 text-[calc(11px*var(--font-scale))] transition-colors",
              isActive
                ? "border-theme-border bg-theme-surface text-theme-text-primary"
                : "border-transparent bg-transparent text-theme-text-tertiary hover:bg-theme-hover/60 hover:text-theme-text-secondary",
            )}
          >
            <span
              className={cn(
                "pointer-events-none absolute inset-x-0 top-0 h-0.5 rounded-t",
                isActive ? "bg-skyhook-500" : "bg-transparent",
              )}
            />
            <button
              type="button"
              className="flex min-w-0 items-center gap-1.5"
              onClick={() => activateResource(clusterId, tab)}
            >
              <Icon
                className={cn(
                  "h-3 w-3 shrink-0",
                  isActive ? "text-accent-text" : "text-theme-text-tertiary",
                )}
              />
              <span className="truncate">{tab.name}</span>
            </button>
            <button
              type="button"
              className={cn(
                "shrink-0 rounded p-0.5 text-theme-text-tertiary hover:bg-theme-hover hover:text-theme-text-primary",
                isActive ? "opacity-70" : "opacity-0 group-hover/tab:opacity-70",
              )}
              title="Close tab (⌘W)"
              onClick={() => closePaneTab(clusterId, pane.id, tab)}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        );
      })}

      <Menu
        width={260}
        align="end"
        trigger={({ open, toggle }) => (
          <button
            type="button"
            onClick={toggle}
            title="Pane tabs and split actions"
            className={cn(
              "ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded text-theme-text-tertiary hover:bg-theme-hover hover:text-theme-text-primary",
              open && "bg-theme-hover text-theme-text-primary",
            )}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        )}
      >
        {({ close }) => (
          <>
            <MenuLabel>Open in this pane</MenuLabel>
            {pane.tabs.map((tab) => {
              const info = resources.find(
                (entry) => entry.apiVersion === tab.apiVersion && entry.kind === tab.kind,
              );
              const Icon = getKindIcon(tab.kind, info?.group);
              const isActive = pane.active !== null && sameRef(pane.active, tab);
              return (
                <MenuItem
                  key={tabKey(tab)}
                  icon={<Icon className="h-3.5 w-3.5" />}
                  shortcut={isActive ? "✓" : undefined}
                  onClick={() => {
                    activateResource(clusterId, tab);
                    close();
                  }}
                >
                  {tab.name}
                </MenuItem>
              );
            })}
            <MenuSeparator />
            <MenuLabel>Split</MenuLabel>
            <MenuItem
              icon={<Columns2 className="h-3.5 w-3.5" />}
              disabled={!canSplitRight || !pane.active}
              onClick={() => {
                if (pane.active) openDetailsInNewPane(clusterId, pane.active, "right");
                close();
              }}
            >
              Split right
            </MenuItem>
            <MenuItem
              icon={<Rows2 className="h-3.5 w-3.5" />}
              disabled={!canSplitDown || !pane.active}
              onClick={() => {
                if (pane.active) openDetailsInNewPane(clusterId, pane.active, "down");
                close();
              }}
            >
              Split down
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              icon={<X className="h-3.5 w-3.5" />}
              danger
              onClick={() => {
                for (const tab of [...pane.tabs]) closePaneTab(clusterId, pane.id, tab);
                close();
              }}
            >
              Close all tabs
            </MenuItem>
          </>
        )}
      </Menu>

      <ContextMenu open={menu !== null} x={menu?.x ?? 0} y={menu?.y ?? 0} onClose={closeMenu} width={240}>
        {menu ? (
          <>
            <MenuLabel>
              {menu.ref.kind}/{menu.ref.name}
            </MenuLabel>
            <MenuItem
              icon={<X className="h-3 w-3" />}
              onClick={() => {
                closePaneTab(clusterId, pane.id, menu.ref);
                closeMenu();
              }}
            >
              Close
            </MenuItem>
            <MenuItem
              onClick={() => {
                closeOtherPaneTabs(clusterId, pane.id, menu.ref);
                closeMenu();
              }}
            >
              Close others
            </MenuItem>
            <MenuItem
              disabled={!canCloseRight}
              onClick={() => {
                closePaneTabsToRight(clusterId, pane.id, menu.ref);
                closeMenu();
              }}
            >
              Close to the right
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              icon={<Columns2 className="h-3 w-3" />}
              disabled={!canSplitRight}
              onClick={() => {
                openDetailsInNewPane(clusterId, menu.ref, "right");
                closeMenu();
              }}
            >
              Split right
            </MenuItem>
            <MenuItem
              icon={<Rows2 className="h-3 w-3" />}
              disabled={!canSplitDown}
              onClick={() => {
                openDetailsInNewPane(clusterId, menu.ref, "down");
                closeMenu();
              }}
            >
              Split down
            </MenuItem>
            {otherPanes.length > 0 ? (
              <>
                <MenuSeparator />
                <MenuLabel>Move to pane</MenuLabel>
                {otherPanes.map((target, index) => (
                  <MenuItem
                    key={target.id}
                    onClick={() => {
                      moveTab(clusterId, pane.id, target.id, menu.ref);
                      closeMenu();
                    }}
                  >
                    Pane {index + 2}
                  </MenuItem>
                ))}
              </>
            ) : null}
          </>
        ) : null}
      </ContextMenu>
    </div>
  );
}

const EMPTY_RESOURCES: never[] = [];
const EMPTY_PANES: EditorPaneState[] = [];
