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

function initials(name: string): string {
  const parts = name
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[parts.length - 2][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function hueFor(name: string): number {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) hash = (hash * 31 + name.charCodeAt(index)) % 360;
  return Math.abs(hash);
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
      className="flex w-[54px] shrink-0 flex-col items-center gap-1.5 border-r border-theme-border bg-theme-sidebar py-2"
      aria-label="Clusters"
    >
      <Tooltip content="Cluster catalog" side="top">
        <button
          type="button"
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg border border-theme-border bg-theme-surface text-theme-text-secondary hover:text-theme-text-primary",
            activeClusterId === null && "ring-2 ring-skyhook-500/60",
          )}
          onClick={() => setActiveCluster(null)}
        >
          <Blocks className="h-4 w-4" />
        </button>
      </Tooltip>

      <div className="my-1 h-px w-7 bg-theme-border" />

      <div className="flex min-h-0 flex-1 flex-col items-center gap-1.5 overflow-y-auto px-0.5">
        {slots.map((cluster, slotIndex) => {
          const active = cluster?.id === activeClusterId;
          const session = cluster ? sessions[cluster.id] : undefined;
          const state: string | undefined = cluster
            ? (session?.status ?? health[cluster.id]?.status)
            : undefined;
          const dot =
            state === "connected"
              ? "bg-emerald-500"
              : state === "error"
                ? "bg-red-500"
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
                "relative rounded-lg",
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
                      void openCluster(cluster.id);
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setMenu({ id: cluster.id, x: event.clientX, y: event.clientY });
                    }}
                    className={cn(
                      "relative flex h-9 w-9 items-center justify-center rounded-lg border text-[10px] font-semibold text-white shadow-theme-sm transition-all",
                      active
                        ? "ring-2 ring-skyhook-500 ring-offset-2 ring-offset-theme-sidebar"
                        : "opacity-90 hover:opacity-100",
                      dragging === cluster.id && "opacity-40",
                    )}
                    style={{
                      background: `hsl(${hueFor(cluster.name)} 38% 36%)`,
                      borderColor: `hsl(${hueFor(cluster.name)} 44% 52% / 0.7)`,
                    }}
                    aria-label={cluster.name}
                  >
                    {initials(cluster.name)}
                    <span
                      className={cn(
                        "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-theme-sidebar",
                        dot,
                      )}
                    />
                  </button>
                </Tooltip>
              ) : (
                <Tooltip content={`Empty hotbar slot ${slotIndex + 1} — drag a favourite here`} side="bottom">
                  <button
                    type="button"
                    onClick={() => setActiveCluster(null)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-dashed border-theme-border/70 text-theme-text-disabled transition-colors hover:border-theme-border hover:text-theme-text-secondary"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </Tooltip>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-1 flex flex-col items-center gap-1 border-t border-theme-border pt-2">
        <Tooltip content="Import kubeconfig" side="bottom">
          <button type="button" className="shell-icon-button h-8 w-8" onClick={() => void importViaDialog()}>
            <Plus className="h-4 w-4" />
          </button>
        </Tooltip>
        <Tooltip content="Settings" side="bottom">
          <button type="button" className="shell-icon-button h-8 w-8" onClick={() => openSettings(true)}>
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
