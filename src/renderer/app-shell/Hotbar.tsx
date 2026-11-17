import { useMemo, useRef, useState } from "react";
import { Blocks, Plus, Settings } from "lucide-react";
import { useCatalogStore } from "../stores/catalog-store";
import { useSessionStore } from "../stores/session-store";
import { cn } from "../lib/cn";
import { Tooltip } from "../design-system/components/Tooltip";
import { ContextMenu } from "../design-system/components/ContextMenu";
import { MenuItem, MenuLabel, MenuSeparator } from "../design-system/components/Menu";
import { openCluster } from "../lib/cluster-actions";
import type { ClusterSummary } from "@shared/types";

const SLOT_COUNT = 10;

/**
 * Freelens' `computeDefaultShortName`: first letter of the first three name
 * parts (whitespace → dashes/underscores → `@`), uppercased, e.g.
 * "msk-avg-dev-iaas-mgmt" → "MAD".
 */
function shortName(name: string): string {
  if (!name) return "??";
  const byWhitespace = name.split(/\s+/);
  const parts =
    byWhitespace.length > 1 ? byWhitespace : name.split(/[-_]+/).length > 1 ? name.split(/[-_]+/) : name.split(/@+/);
  const [rawFirst, rawSecond, rawThird] = parts;
  const first = [...rawFirst];
  const second = rawSecond ? [...rawSecond] : first.slice(1);
  const third = rawThird ? [...rawThird] : [];
  return [first[0], second[0], third[0]].filter(Boolean).join("").toUpperCase();
}

/** Freelens' seeded avatar colour: FNV-1a hue, fixed saturation/lightness so white text always clears WCAG AA. */
function tileColor(name: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < name.length; index += 1) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `hsl(${(hash >>> 0) % 360}, 60%, 27%)`;
}

export function Hotbar({ activeClusterId }: { activeClusterId: string | null }) {
  const clusters = useCatalogStore((state) => state.clusters);
  const settings = useCatalogStore((state) => state.settings);
  const health = useCatalogStore((state) => state.health);
  const setActiveCluster = useCatalogStore((state) => state.setActiveCluster);
  const openSettings = useCatalogStore((state) => state.openSettings);
  const importViaDialog = useCatalogStore((state) => state.importViaDialog);
  const updateSettings = useCatalogStore((state) => state.updateSettings);
  const sessions = useSessionStore((state) => state.sessions);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropSlot, setDropSlot] = useState<number | null>(null);
  const [pressed, setPressed] = useState<string | null>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; active: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  const slots = useMemo(() => {
    const byId = new Map(clusters.map((cluster) => [cluster.id, cluster]));
    const favorites = settings?.favorites ?? [];
    const stored = settings?.hotbarSlots ?? [];
    const result: Array<ClusterSummary | null> = Array(SLOT_COUNT).fill(null);
    const placed = new Set<string>();

    stored.slice(0, SLOT_COUNT).forEach((id, index) => {
      if (!id || !favorites.includes(id) || placed.has(id)) return;
      const cluster = byId.get(id);
      if (!cluster) return;
      result[index] = cluster;
      placed.add(id);
    });

    for (const id of favorites) {
      if (placed.has(id)) continue;
      const cluster = byId.get(id);
      if (!cluster) continue;
      const empty = result.findIndex((entry) => entry === null);
      if (empty === -1) break;
      result[empty] = cluster;
      placed.add(id);
    }
    return result;
  }, [clusters, settings?.favorites, settings?.hotbarSlots]);

  const moveToSlot = (sourceId: string, targetIndex: number) => {
    const ids = slots.map((cluster) => cluster?.id ?? null);
    const from = ids.indexOf(sourceId);
    if (from < 0 || from === targetIndex) return;
    const displaced = ids[targetIndex];
    ids[targetIndex] = sourceId;
    ids[from] = displaced;
    void updateSettings({ hotbarSlots: ids, hotbarOrder: ids.filter((id): id is string => Boolean(id)) });
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
            "flex h-[40px] w-[40px] items-center justify-center rounded-[6px] border border-theme-border bg-theme-surface text-theme-text-secondary transition-shadow hover:shadow-[0_0_0_3px_var(--bg-sidebar),0_0_0_6px_var(--border-default)] hover:text-theme-text-primary",
            activeClusterId === null && "shadow-[0_0_0_3px_var(--bg-sidebar),0_0_0_6px_var(--accent)]",
          )}
          onClick={() => setActiveCluster(null)}
        >
          <Blocks className="h-4 w-4" />
        </button>
      </Tooltip>

      <div className="my-1 h-px w-8 bg-theme-border" />

      <div className="flex min-h-0 flex-1 flex-col items-center gap-[12px] overflow-y-auto px-[12px]">
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
              key={cluster?.id ?? `slot-${slotIndex}`}
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
                <Tooltip
                  side="bottom"
                  content={
                    <div>
                      <div className="font-medium text-theme-text-primary">{cluster.name}</div>
                      <div className="mt-0.5 text-[10px] text-theme-text-tertiary">{cluster.context}</div>
                      <div className="mt-0.5 text-[10px] text-theme-text-disabled">
                        {state === "connected" ? "Connected" : state === "error" ? "Connection error" : "Not connected"}
                        {" · drag to reposition"}
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
                      "relative flex h-[40px] w-[40px] items-center justify-center rounded-[6px] text-[12px] font-semibold uppercase tracking-wide text-white transition-shadow duration-100",
                      active
                        ? "shadow-[0_0_0_3px_var(--bg-sidebar),0_0_0_6px_var(--accent)]"
                        : "hover:shadow-[0_0_0_3px_var(--bg-sidebar),0_0_0_6px_var(--border-default)]",
                      dragging === cluster.id && "opacity-40",
                      pressed === cluster.id && "hotbar-press",
                    )}
                    style={{ background: tileColor(cluster.name) }}
                    aria-label={cluster.name}
                  >
                    {shortName(cluster.name)}
                    <span
                      className={cn(
                        "absolute left-[3px] top-[3px] h-2 w-2 rounded-full border border-theme-sidebar",
                        dot,
                      )}
                    />
                  </button>
                </Tooltip>
              ) : (
                <Tooltip content={`Empty hotbar slot ${slotIndex + 1} — drag a favourite here`} side="bottom">
                  <button
                    type="button"
                    onClick={() => {
                      flash(`empty-${slotIndex}`);
                      setActiveCluster(null);
                    }}
                    className={cn(
                      "flex h-[40px] w-[40px] items-center justify-center rounded-[6px] border border-dashed border-theme-border/70 text-theme-text-disabled transition-colors hover:border-theme-border hover:text-theme-text-secondary",
                      pressed === `empty-${slotIndex}` && "hotbar-shake",
                    )}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </Tooltip>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-1 flex flex-col items-center gap-1.5 border-t border-theme-border pt-2">
        <Tooltip content="Import kubeconfig" side="bottom">
          <button type="button" className="shell-icon-button h-9 w-9" onClick={() => void importViaDialog()}>
            <Plus className="h-4 w-4" />
          </button>
        </Tooltip>
        <Tooltip content="Settings" side="bottom">
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
        <MenuLabel>Move favourite</MenuLabel>
        {(() => {
          if (!menu) return null;
          const from = slots.findIndex((cluster) => cluster?.id === menu.id);
          return (
            <>
              <MenuItem
                disabled={from <= 0}
                onClick={() => {
                  moveToSlot(menu.id, from - 1);
                  setMenu(null);
                }}
              >
                Move left
              </MenuItem>
              <MenuItem
                disabled={from < 0 || from >= SLOT_COUNT - 1}
                onClick={() => {
                  moveToSlot(menu.id, from + 1);
                  setMenu(null);
                }}
              >
                Move right
              </MenuItem>
              <MenuSeparator />
              {Array.from({ length: SLOT_COUNT }, (_, index) => (
                <MenuItem
                  key={index}
                  disabled={index === from}
                  onClick={() => {
                    moveToSlot(menu.id, index);
                    setMenu(null);
                  }}
                >
                  Move to slot {index + 1}
                </MenuItem>
              ))}
            </>
          );
        })()}
      </ContextMenu>
    </nav>
  );
}
