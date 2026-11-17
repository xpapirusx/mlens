import { useMemo, useState } from "react";
import { Blocks, Plus, Settings, Star } from "lucide-react";
import { useCatalogStore } from "../stores/catalog-store";
import { useSessionStore } from "../stores/session-store";
import { cn } from "../lib/cn";
import { Tooltip } from "../design-system/components/Tooltip";
import { openCluster } from "../lib/cluster-actions";
import type { ClusterSummary } from "@shared/types";

function initials(name: string): string {
  const parts = name
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  // The last two segments distinguish clusters better than the shared prefixes
  // (msk-avg-…, lz1-avg-…).
  return `${parts[parts.length - 2][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
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

  // Freelens' hotbar is a curated rail, not a dump of every kubeconfig
  // context. Show favorites, then recently opened clusters, then the active one.
  const [dragging, setDragging] = useState<string | null>(null);

  // Open clusters live in the top cluster tabs. The hotbar is the curated,
  // reorderable rail of favourite clusters, like Freelens' hotbar.
  const ordered = useMemo(() => {
    const byId = new Map(clusters.map((cluster) => [cluster.id, cluster]));
    const favorites = settings?.favorites ?? [];
    const preferred = (settings?.hotbarOrder ?? []).filter((id) => favorites.includes(id));
    const remaining = favorites.filter((id) => !preferred.includes(id));
    return [...preferred, ...remaining]
      .map((id) => byId.get(id))
      .filter((cluster): cluster is ClusterSummary => Boolean(cluster));
  }, [clusters, settings?.favorites, settings?.hotbarOrder]);

  const reorder = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const ids = ordered.map((cluster) => cluster.id);
    const from = ids.indexOf(sourceId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, sourceId);
    void updateSettings({ hotbarOrder: ids });
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
        {ordered.slice(0, 9).map((cluster: ClusterSummary) => {
          const active = cluster.id === activeClusterId;
          const session = sessions[cluster.id];
          const state: string | undefined = session?.status ?? health[cluster.id]?.status;
          const dot =
            state === "connected"
              ? "bg-emerald-500"
              : state === "error"
                ? "bg-red-500"
                : state === "disconnected"
                  ? "bg-slate-500"
                  : "bg-theme-text-disabled";
          return (
            <Tooltip
              key={cluster.id}
              side="bottom"
              content={
                <div>
                  <div className="font-medium text-theme-text-primary">{cluster.name}</div>
                  <div className="mt-0.5 text-[10px] text-theme-text-tertiary">{cluster.context}</div>
                  <div className="mt-0.5 text-[10px] text-theme-text-disabled">
                    {state === "connected" ? "Connected" : state === "error" ? "Connection error" : "Not connected"}
                  </div>
                </div>
              }
            >
              <button
                type="button"
                draggable
                onDragStart={(event) => {
                  setDragging(cluster.id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", cluster.id);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const source = event.dataTransfer.getData("text/plain") || dragging;
                  if (source) reorder(source, cluster.id);
                  setDragging(null);
                }}
                onDragEnd={() => setDragging(null)}
                onClick={() => void openCluster(cluster.id)}
                className={cn(
                  "relative flex h-9 w-9 items-center justify-center rounded-lg text-[11px] font-semibold text-white shadow-theme-sm transition-all",
                  active ? "ring-2 ring-skyhook-500 ring-offset-1 ring-offset-theme-sidebar" : "opacity-85 hover:opacity-100",
                  dragging === cluster.id && "opacity-40",
                )}
                style={{
                  background: `linear-gradient(135deg, hsl(${(cluster.name.charCodeAt(0) * 37) % 360} 45% 42%), hsl(${(cluster.name.charCodeAt(0) * 37 + 40) % 360} 48% 30%))`,
                }}
                aria-label={cluster.name}
              >
                {initials(cluster.name)}
                <span className={cn("absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-theme-sidebar", dot)} />
              </button>
            </Tooltip>
          );
        })}

        {ordered.length === 0 ? (
          <Tooltip content="Star clusters in the catalog to pin them here. Drag to reorder." side="bottom">
            <button
              type="button"
              onClick={() => setActiveCluster(null)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-dashed border-theme-border text-theme-text-tertiary hover:text-theme-text-primary"
            >
              <Star className="h-4 w-4" />
            </button>
          </Tooltip>
        ) : null}
      </div>

      <div className="mt-1 flex flex-col items-center gap-1 border-t border-theme-border pt-2">
        <Tooltip content="Import kubeconfig" side="bottom">
          <button
            type="button"
            className="shell-icon-button h-8 w-8"
            onClick={() => void importViaDialog()}
          >
            <Plus className="h-4 w-4" />
          </button>
        </Tooltip>
        <Tooltip content="Settings" side="bottom">
          <button type="button" className="shell-icon-button h-8 w-8" onClick={() => openSettings(true)}>
            <Settings className="h-4 w-4" />
          </button>
        </Tooltip>
      </div>
    </nav>
  );
}
