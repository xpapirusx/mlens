import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Blocks,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Plus,
  Plug,
  Settings,
  StarOff,
  Unplug,
} from "lucide-react";
import { useCatalogStore } from "../stores/catalog-store";
import { useChromeSessions } from "../stores/session-store";
import { cn } from "../lib/cn";
import { Tooltip } from "../design-system/components/Tooltip";
import { ContextMenu } from "../design-system/components/ContextMenu";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "../design-system/components/Menu";
import { disconnectCluster, openCluster } from "../lib/cluster-actions";
import { clusterShortName } from "../lib/short-name";
import { CLUSTER_COLOR_PALETTE, resolveClusterColor } from "../lib/cluster-color";
import type { ClusterSummary } from "@shared/types";

const SLOT_COUNT = 10;
/** Freelens caps a hotbar at twelve cells; mLens keeps ten per page. */
const MAX_PAGES = 12;

function padPage(page: Array<ClusterSummary | null>): Array<ClusterSummary | null> {
  const padded = [...page.slice(0, SLOT_COUNT)];
  while (padded.length < SLOT_COUNT) padded.push(null);
  return padded;
}

/**
 * Тултип для хотбара — как в Freelens: рендерится через портал в document.body,
 * поэтому `overflow-y-auto` / `overflow-x-hidden` у `.hotbar-scroll` его не режет,
 * а `flip` из floating-ui не может увести его наверх.
 *
 * Реф висит на обычном inline-flex контейнере (а НЕ на `display: contents` —
 * у такого элемента нет бокса, и `getBoundingClientRect()` возвращает нули).
 */
function HotbarTooltip({
  children,
  content,
  side = "right",
}: {
  children: React.ReactNode;
  content: React.ReactNode;
  side?: "right" | "bottom";
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const anchorRef = useRef<HTMLDivElement>(null);

  const show = () => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const offset = 8;
    if (side === "right") {
      // Справа от кнопки, по центру её вертикали.
      setCoords({ x: rect.right + offset, y: rect.top + rect.height / 2 });
    } else {
      // Снизу от кнопки, выровнено по левому краю.
      setCoords({ x: rect.left, y: rect.bottom + offset });
    }
    setOpen(true);
  };

  return (
    <>
      <div
        ref={anchorRef}
        onPointerEnter={show}
        onPointerLeave={() => setOpen(false)}
        onPointerDown={() => setOpen(false)}
        className="inline-flex"
      >
        {children}
      </div>

      {open &&
        createPortal(
          <div
            className="pointer-events-none fixed z-50 max-w-[240px] rounded-md border border-theme-border bg-theme-surface px-3 py-2 text-[calc(11px*var(--font-scale))] shadow-lg"
            style={{
              left: coords.x,
              top: coords.y,
              transform: side === "right" ? "translateY(-50%)" : undefined,
            }}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}

export function Hotbar({ activeClusterId }: { activeClusterId: string | null }) {
  const clusters = useCatalogStore((state) => state.clusters);
  const settings = useCatalogStore((state) => state.settings);
  const health = useCatalogStore((state) => state.health);
  const setActiveCluster = useCatalogStore((state) => state.setActiveCluster);
  const openSettings = useCatalogStore((state) => state.openSettings);
  const importViaDialog = useCatalogStore((state) => state.importViaDialog);
  const toggleFavorite = useCatalogStore((state) => state.toggleFavorite);
  const updateSettings = useCatalogStore((state) => state.updateSettings);
  const sessions = useChromeSessions();
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropSlot, setDropSlot] = useState<number | null>(null);
  const [pressed, setPressed] = useState<string | null>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; active: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  // ── Pages ──────────────────────────────────────────────────────
  const storedPages = useMemo(() => {
    const raw = settings?.hotbarPages;
    const source = Array.isArray(raw) && raw.length > 0 ? raw : [settings?.hotbarSlots ?? []];
    return source.slice(0, MAX_PAGES).map((page) => (Array.isArray(page) ? page.slice(0, SLOT_COUNT) : []));
  }, [settings?.hotbarPages, settings?.hotbarSlots]);

  const pageCount = storedPages.length;
  const pageIndex = Math.min(Math.max(0, settings?.hotbarPageIndex ?? 0), pageCount - 1);

  const resolvedPages = useMemo(() => {
    const byId = new Map(clusters.map((cluster) => [cluster.id, cluster]));
    const favorites = settings?.favorites ?? [];
    const placed = new Set<string>();

    const result = storedPages.map((page) =>
      padPage(
        page.map((id) => {
          if (!id || !favorites.includes(id) || placed.has(id)) return null;
          const cluster = byId.get(id);
          if (!cluster) return null;
          placed.add(id);
          return cluster;
        }),
      ),
    );

    // No favourite is ever lost: anything not explicitly placed fills the
    // first free slot, starting from the page the user is currently on.
    const pageOrder = result.map((_, index) => (pageIndex + index) % result.length);
    for (const id of favorites) {
      if (placed.has(id)) continue;
      const cluster = byId.get(id);
      if (!cluster) continue;
      let target: { page: number; slot: number } | null = null;
      for (const page of pageOrder) {
        const slot = result[page].findIndex((entry) => entry === null);
        if (slot >= 0) {
          target = { page, slot };
          break;
        }
      }
      if (!target) break;
      result[target.page][target.slot] = cluster;
      placed.add(id);
    }

    return result;
  }, [storedPages, clusters, settings?.favorites, pageIndex]);

  // A favourite added while another page is active belongs on that page:
  // persist the placement instead of deriving it, so it does not jump pages.
  useEffect(() => {
    if (!settings) return;
    const pages = settings.hotbarPages.map((page) => [...page]);
    if (pages.length === 0) return;
    const visible = new Set(clusters.map((cluster) => cluster.id));
    const placed = new Set<string>();
    for (const page of pages) {
      for (const id of page) if (id) placed.add(id);
    }
    const unplaced = settings.favorites.filter((id) => visible.has(id) && !placed.has(id));
    if (unplaced.length === 0) return;
    const active = Math.min(Math.max(0, settings.hotbarPageIndex ?? 0), pages.length - 1);
    const order = pages.map((_, index) => (active + index) % pages.length);
    let changed = false;
    for (const id of unplaced) {
      for (const index of order) {
        const slot = pages[index].findIndex((entry) => entry === null);
        if (slot >= 0) {
          pages[index][slot] = id;
          changed = true;
          break;
        }
      }
    }
    if (!changed) return;
    void updateSettings({
      hotbarPages: pages,
      hotbarSlots: [...pages[active]],
      hotbarOrder: pages[active].filter((id): id is string => Boolean(id)),
    });
  }, [settings, clusters, updateSettings]);

  const slots = resolvedPages[pageIndex] ?? padPage([]);

  const writePages = (next: Array<Array<string | null>>, activeIndex = pageIndex) => {
    const index = Math.min(Math.max(0, activeIndex), next.length - 1);
    const page = (next[index] ?? []).slice(0, SLOT_COUNT);
    const ids = page.map((entry) => entry ?? null);
    void updateSettings({
      hotbarPages: next.map((entry) => entry.slice(0, SLOT_COUNT).map((id) => id ?? null)),
      hotbarPageIndex: index,
      hotbarSlots: ids,
      hotbarOrder: ids.filter((id): id is string => Boolean(id)),
    });
  };

  const switchPage = (index: number) => {
    const next = Math.min(Math.max(0, index), resolvedPages.length - 1);
    if (next === pageIndex) return;
    void updateSettings({ hotbarPageIndex: next });
  };

  const addPage = () => {
    if (resolvedPages.length >= MAX_PAGES) return;
    const next = [...resolvedPages.map((page) => page.map((entry) => entry?.id ?? null)), Array(SLOT_COUNT).fill(null)];
    writePages(next, next.length - 1);
  };

  const removePage = (index: number) => {
    if (resolvedPages.length <= 1) return;
    const next = resolvedPages.filter((_, position) => position !== index).map((page) => page.map((entry) => entry?.id ?? null));
    writePages(next, Math.min(index, next.length - 1));
  };

  const moveToSlot = (sourceId: string, targetIndex: number) => {
    const ids = slots.map((cluster) => cluster?.id ?? null);
    const from = ids.indexOf(sourceId);
    if (from < 0 || from === targetIndex) return;
    const displaced = ids[targetIndex];
    ids[targetIndex] = sourceId;
    ids[from] = displaced;
    const next = resolvedPages.map((page, position) =>
      position === pageIndex ? ids : page.map((entry) => entry?.id ?? null),
    );
    writePages(next);
  };

  const slotUnderPointer = (x: number, y: number): number | null => {
    const element = document.elementFromPoint(x, y) as HTMLElement | null;
    const slot = element?.closest<HTMLElement>("[data-hotbar-slot]");
    if (!slot) return null;
    const value = Number(slot.dataset.hotbarSlot);
    return Number.isFinite(value) ? value : null;
  };

  const flash = (id: string) => {
    setPressed(id);
    window.setTimeout(() => setPressed((current) => (current === id ? null : current)), 260);
  };

  const beginPointerDrag = (event: React.PointerEvent, clusterId: string) => {
    if (event.button !== 0) return;
    dragRef.current = { id: clusterId, startX: event.clientX, startY: event.clientY, active: false };

    const onMove = (moveEvent: PointerEvent) => {
      const state = dragRef.current;
      if (!state) return;
      const distance = Math.hypot(moveEvent.clientX - state.startX, moveEvent.clientY - state.startY);
      if (!state.active && distance < 6) return;
      if (!state.active) {
        state.active = true;
        setDragging(state.id);
      }
      moveEvent.preventDefault();
      setDropSlot(slotUnderPointer(moveEvent.clientX, moveEvent.clientY));
    };

    const onUp = (upEvent: PointerEvent) => {
      const state = dragRef.current;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (state?.active) {
        const target = slotUnderPointer(upEvent.clientX, upEvent.clientY);
        if (target !== null) moveToSlot(state.id, target);
        suppressClick.current = true;
        window.setTimeout(() => {
          suppressClick.current = false;
        }, 0);
      }
      dragRef.current = null;
      setDragging(null);
      setDropSlot(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <nav
      className="flex w-16 shrink-0 flex-col items-center gap-2 border-r border-theme-border bg-theme-sidebar py-2"
      aria-label="Clusters"
      style={{ width: "var(--shell-hotbar-width)" }}
    >
      <Tooltip content="Cluster catalog" side="top">
        <button
          type="button"
          className={cn(
            "flex h-[35px] w-[40px] items-center justify-center rounded-[6px] border border-theme-border bg-theme-surface text-theme-text-secondary transition-shadow hover:shadow-[0_0_0_3px_var(--bg-sidebar),0_0_0_6px_var(--border-default)] hover:text-theme-text-primary",
            activeClusterId === null && "shadow-[0_0_0_3px_var(--bg-sidebar),0_0_0_6px_var(--accent)]",
          )}
          onClick={() => setActiveCluster(null)}
        >
          <Blocks className="h-4 w-4" />
        </button>
      </Tooltip>
      <div className="my-1 h-px w-90 bg-theme-border" />

      <div className="hotbar-scroll flex min-h-0 flex-1 flex-col items-center gap-[12px] overflow-y-auto overflow-x-hidden px-[12px] pt-2">
        {slots.map((cluster, slotIndex) => {
          const active = cluster?.id === activeClusterId;
          const session = cluster ? sessions[cluster.id] : undefined;
          const state: string | undefined = cluster
            ? (session?.status ?? health[cluster.id]?.status)
            : undefined;
          const dot =
            state === "connected"
              ? "bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.9)]"
              : state === "error"
                ? "bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.8)]"
                : state === "disconnected"
                  ? "bg-slate-500"
                  : "bg-theme-text-disabled";

          return (
            <div
              key={cluster?.id ?? `slot-${pageIndex}-${slotIndex}`}
              data-hotbar-slot={slotIndex}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDropSlot(slotIndex);
              }}
              onDragLeave={() => setDropSlot((current) => (current === slotIndex ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                const source = event.dataTransfer.getData("text/plain") || dragging;
                if (source) moveToSlot(source, slotIndex);
                setDragging(null);
                setDropSlot(null);
              }}
              className={cn(
                "relative rounded-md",
                dropSlot === slotIndex && "ring-2 ring-skyhook-400 ring-offset-1 ring-offset-theme-sidebar",
              )}
            >
              {cluster ? (
                <HotbarTooltip
                  side="right"
                  content={
                    <div>
                      <div className="font-medium text-theme-text-primary">{cluster.name}</div>
                      {/* <div className="mt-0.5 text-[calc(10px*var(--font-scale))] text-theme-text-tertiary">{cluster.context}</div> */}
                      <div className="mt-0.5 flex items-center gap-1.5 text-[calc(10px*var(--font-scale))] text-theme-text-disabled">
                        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dot)} />
                        <span>
                          {state === "connected"
                            ? "Connected"
                            : state === "connecting"
                              ? "Connecting…"
                              : state === "error"
                                ? "Connection error"
                                : "Not connected"}
                        </span>
                        <span>· drag to reposition</span>
                      </div>
                    </div>
                  }
                >
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => {
                      dragRef.current = null;
                      setDragging(cluster.id);
                      suppressClick.current = true;
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", cluster.id);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setDropSlot(null);
                      window.setTimeout(() => {
                        suppressClick.current = false;
                      }, 0);
                    }}
                    onPointerDown={(event) => beginPointerDrag(event, cluster.id)}
                    onClick={() => {
                      if (suppressClick.current) return;
                      flash(cluster.id);
                      void openCluster(cluster.id);
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setMenu({ id: cluster.id, x: event.clientX, y: event.clientY });
                    }}
                    className={cn(
                      "relative flex h-[40px] w-[40px] items-center justify-center rounded-[6px] text-[calc(12px*var(--font-scale))] font-semibold uppercase tracking-wide text-white transition-shadow duration-100",
                      active
                        ? "shadow-[0_0_0_3px_var(--bg-sidebar),0_0_0_6px_var(--accent)]"
                        : "hover:shadow-[0_0_0_3px_var(--bg-sidebar),0_0_0_6px_var(--border-default)]",
                      dragging === cluster.id && "opacity-40",
                      pressed === cluster.id && "hotbar-press",
                    )}
                    style={{
                      background: resolveClusterColor(
                        cluster.id,
                        cluster.name,
                        settings?.clusterColors,
                        settings?.clusterColorRules,
                        cluster.context,
                      ),
                    }}
                    aria-label={cluster.name}
                  >
                    {clusterShortName(cluster.name)}
                    <span
                      className={cn(
                        "absolute left-[3px] top-[3px] h-2 w-2 rounded-full border border-theme-sidebar",
                        dot,
                      )}
                    />
                  </button>
                </HotbarTooltip>
              ) : (
                <HotbarTooltip
                  side="right"
                  content={`Empty hotbar slot ${pageIndex + 1}:${slotIndex + 1} — drag a favourite here`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      flash(`empty-${pageIndex}-${slotIndex}`);
                      setActiveCluster(null);
                    }}
                    className={cn(
                      "flex h-[40px] w-[40px] items-center justify-center rounded-[6px] border border-dashed border-theme-border/70 text-theme-text-disabled transition-colors hover:border-theme-border hover:text-theme-text-secondary",
                      pressed === `empty-${pageIndex}-${slotIndex}` && "hotbar-shake",
                    )}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </HotbarTooltip>
              )}
            </div>
          );
        })}
      </div>

      {/* Freelens-style page selector: ‹ index › — the index opens the page list. */}
      <div className="mt-1 flex items-center justify-center gap-0.5 border-t border-theme-border pt-2">
        <Tooltip content="Previous hotbar page" side="top">
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded text-theme-text-tertiary transition-colors hover:bg-theme-hover hover:text-theme-text-primary disabled:opacity-30 disabled:hover:bg-transparent"
            disabled={pageIndex <= 0}
            onClick={() => switchPage(pageIndex - 1)}
            aria-label="Previous hotbar page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        </Tooltip>

        <Menu
          align="start"
          side="top"
          width={200}
          trigger={({ toggle }) => (
            <button
              type="button"
              onClick={toggle}
              title={`Hotbar page ${pageIndex + 1} of ${pageCount} — click to switch or add a page`}
              className="min-w-[3ch] rounded border border-theme-border bg-theme-surface px-1.5 py-0.5 font-mono text-[calc(11px*var(--font-scale))] text-theme-text-secondary transition-colors hover:bg-theme-hover hover:text-theme-text-primary"
            >
              {pageIndex + 1}
            </button>
          )}
        >
          {({ close }) => (
            <>
              <MenuLabel>Hotbar pages</MenuLabel>
              {resolvedPages.map((_, index) => (
                <MenuItem
                  key={index}
                  icon={index === pageIndex ? <Check className="h-3 w-3 text-accent-text" /> : undefined}
                  onClick={() => {
                    switchPage(index);
                    close();
                  }}
                >
                  Page {index + 1}
                </MenuItem>
              ))}
              <MenuSeparator />
              <MenuItem
                icon={<Plus className="h-3 w-3" />}
                disabled={resolvedPages.length >= MAX_PAGES}
                onClick={() => {
                  addPage();
                  close();
                }}
              >
                New page
              </MenuItem>
              <MenuItem
                danger
                disabled={resolvedPages.length <= 1}
                onClick={() => {
                  removePage(pageIndex);
                  close();
                }}
              >
                Remove this page
              </MenuItem>
            </>
          )}
        </Menu>

        <Tooltip content="Next hotbar page" side="top">
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded text-theme-text-tertiary transition-colors hover:bg-theme-hover hover:text-theme-text-primary disabled:opacity-30 disabled:hover:bg-transparent"
            disabled={pageIndex >= pageCount - 1}
            onClick={() => switchPage(pageIndex + 1)}
            aria-label="Next hotbar page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </Tooltip>
      </div>

      <div className="mt-1 flex flex-col items-center gap-1.5 pt-1">
        <Tooltip content="Import kubeconfig" side="right">
          <button type="button" className="shell-icon-button h-9 w-9" onClick={() => void importViaDialog()}>
            <Plus className="h-4 w-4" />
          </button>
        </Tooltip>
        <Tooltip content="Settings" side="right">
          <button type="button" className="shell-icon-button h-9 w-9" onClick={() => openSettings(true)}>
            <Settings className="h-4 w-4" />
          </button>
        </Tooltip>
      </div>

      <ContextMenu
        open={Boolean(menu)}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        onClose={() => setMenu(null)}
        width={220}
      >
        {(() => {
          if (!menu) return null;
          const from = slots.findIndex((cluster) => cluster?.id === menu.id);
          const cluster = clusters.find((entry) => entry.id === menu.id);
          const connected = sessions[menu.id]?.status === "connected";
          return (
            <>
              <MenuLabel>{cluster?.name ?? "Cluster"}</MenuLabel>
              <MenuItem
                icon={<ChevronUp className="h-3.5 w-3.5" />}
                disabled={from <= 0}
                onClick={() => {
                  moveToSlot(menu.id, from - 1);
                  setMenu(null);
                }}
              >
                Move up
              </MenuItem>
              <MenuItem
                icon={<ChevronDown className="h-3.5 w-3.5" />}
                disabled={from < 0 || from >= SLOT_COUNT - 1}
                onClick={() => {
                  moveToSlot(menu.id, from + 1);
                  setMenu(null);
                }}
              >
                Move down
              </MenuItem>
              <MenuSeparator />
              <MenuLabel>Color</MenuLabel>
              <div className="flex flex-wrap gap-1 px-1.5 pb-1">
                {CLUSTER_COLOR_PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    title={color}
                    aria-label={`Set color ${color}`}
                    onClick={() => {
                      void updateSettings({
                        clusterColors: { ...(settings?.clusterColors ?? {}), [menu.id]: color },
                      });
                      setMenu(null);
                    }}
                    className={cn(
                      "h-5 w-5 rounded-full border border-black/20 transition-transform hover:scale-110",
                      settings?.clusterColors?.[menu.id] === color &&
                        "ring-2 ring-skyhook-400 ring-offset-1 ring-offset-theme-surface",
                    )}
                    style={{ background: color }}
                  />
                ))}
              </div>
              <MenuItem
                disabled={!settings?.clusterColors?.[menu.id]}
                onClick={() => {
                  const next = { ...(settings?.clusterColors ?? {}) };
                  delete next[menu.id];
                  void updateSettings({ clusterColors: next });
                  setMenu(null);
                }}
              >
                Use automatic color
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                icon={<Plug className="h-3.5 w-3.5" />}
                tone="success"
                disabled={connected}
                onClick={() => {
                  setMenu(null);
                  void openCluster(menu.id);
                }}
              >
                Connect
              </MenuItem>
              <MenuItem
                icon={<Unplug className="h-3.5 w-3.5" />}
                danger
                disabled={!connected}
                onClick={() => {
                  setMenu(null);
                  void disconnectCluster(menu.id);
                }}
              >
                Disconnect
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                icon={<StarOff className="h-3.5 w-3.5" />}
                onClick={() => {
                  setMenu(null);
                  void toggleFavorite(menu.id);
                }}
              >
                Remove from hotbar
              </MenuItem>
            </>
          );
        })()}
      </ContextMenu>
    </nav>
  );
}