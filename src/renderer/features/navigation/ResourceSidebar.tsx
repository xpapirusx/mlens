import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  DoorOpen,
  Download,
  LogOut,
  RefreshCw,
  Settings,
  Star,
} from "lucide-react";
import type { ClusterSummary } from "@shared/types";
import { useCatalogStore } from "../../stores/catalog-store";
import { useSessionStore } from "../../stores/session-store";
import { buildResourceGroups, filterGroups, isListable } from "../../lib/catalog";
import { kindColor, kindLabel, getKindIcon } from "../../lib/icons";
import { cn } from "../../lib/cn";
import { CountBadge } from "../../design-system/components/Badge";
import { SearchInput } from "../../design-system/components/SearchInput";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "../../design-system/components/Menu";
import { Spinner } from "../../design-system/components/Spinner";
import { countFor, useResourceCounts } from "./useResourceCounts";
import { api, call } from "../../lib/api";
import { toast } from "../../design-system/components/Toast";

export function ResourceSidebar({
  cluster,
  clusterId,
  width,
}: {
  cluster: ClusterSummary | undefined;
  clusterId: string;
  width: number;
}) {
  const session = useSessionStore((state) => state.sessions[clusterId]);
  const selectKind = useSessionStore((state) => state.selectKind);
  const toggleGroup = useSessionStore((state) => state.toggleGroup);
  const setNamespace = useSessionStore((state) => state.setNamespace);
  const settings = useCatalogStore((state) => state.settings);
  const updateSettings = useCatalogStore((state) => state.updateSettings);
  const disconnect = useCatalogStore((state) => state.disconnect);
  const setActiveCluster = useCatalogStore((state) => state.setActiveCluster);
  const openSettings = useCatalogStore((state) => state.openSettings);
  const dispose = useSessionStore((state) => state.dispose);

  const [search, setSearch] = useState("");
  const refreshSeconds = settings?.refreshIntervalSeconds ?? 30;

  const resources = session?.resources ?? [];
  const groups = useMemo(() => buildResourceGroups(resources), [resources]);
  const filtered = useMemo(() => filterGroups(groups, search), [groups, search]);
  const counts = useResourceCounts({
    clusterId,
    namespace: session?.namespace ?? "all",
    resources: resources.filter(isListable),
    refreshSeconds,
  });

  const selected = session?.selectedKind;
  const isFavorite = settings?.favorites.includes(clusterId) ?? false;

  const onDisconnect = async () => {
    await disconnect(clusterId);
    dispose(clusterId);
    setActiveCluster(null);
    toast.info("Cluster disconnected", cluster?.name);
  };

  return (
    <aside
      className="flex h-full min-h-0 shrink-0 flex-col border-r border-theme-border bg-theme-sidebar"
      style={{ width }}
      aria-label="Resource catalog"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-theme-border px-2.5 py-2.5">
        <div className="relative">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-skyhook-500 to-skyhook-800 text-[11px] font-semibold text-white shadow-theme-sm">
            {(cluster?.name ?? "C").slice(0, 2).toUpperCase()}
          </div>
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-theme-sidebar",
              session?.status === "connected" ? "bg-emerald-500" : session?.status === "error" ? "bg-red-500" : "bg-amber-500",
            )}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-theme-text-primary" title={cluster?.name}>
            {cluster?.name ?? "Cluster"}
          </div>
          <div className="flex items-center gap-1.5 truncate text-[10px] text-theme-text-tertiary">
            <span>{session?.info?.version ? `v${session.info.version}` : "connecting…"}</span>
            <span className="text-theme-text-disabled">·</span>
            <span className="truncate">{session?.info?.context ?? cluster?.context}</span>
          </div>
        </div>
        <Menu
          width={230}
          align="end"
          trigger={({ open, toggle }) => (
            <button
              type="button"
              onClick={toggle}
              className={cn("shell-icon-button h-6 w-6", open && "bg-theme-hover text-theme-text-primary")}
              title="Cluster actions"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          )}
        >
          {({ close }) => (
            <>
              <MenuItem
                icon={<Star className={cn("h-3.5 w-3.5", isFavorite && "fill-current")} />}
                onClick={() => {
                  void updateSettings({
                    favorites: isFavorite
                      ? (settings?.favorites ?? []).filter((entry) => entry !== clusterId)
                      : [...(settings?.favorites ?? []), clusterId],
                  });
                  close();
                }}
              >
                {isFavorite ? "Remove from favorites" : "Add to favorites"}
              </MenuItem>
              <MenuItem
                icon={<Copy className="h-3.5 w-3.5" />}
                onClick={() => {
                  void navigator.clipboard.writeText(cluster?.context ?? cluster?.name ?? "");
                  toast.success("Context copied");
                  close();
                }}
              >
                Copy context name
              </MenuItem>
              <MenuItem
                icon={<Download className="h-3.5 w-3.5" />}
                onClick={() => {
                  void call(api.clusters.namespaces(clusterId))
                    .then((namespaces) => {
                      setNamespace(clusterId, "all");
                      toast.info("Namespaces refreshed", `${namespaces.length} namespaces`);
                    })
                    .catch((error) => toast.error("Cannot refresh namespaces", String(error)));
                  close();
                }}
              >
                Refresh namespaces
              </MenuItem>
              <MenuSeparator />
              <MenuItem icon={<Settings className="h-3.5 w-3.5" />} onClick={() => { openSettings(true); close(); }}>
                Settings
              </MenuItem>
              <MenuItem
                icon={<DoorOpen className="h-3.5 w-3.5" />}
                onClick={() => { setActiveCluster(null); close(); }}
              >
                Back to catalog
              </MenuItem>
              <MenuSeparator />
              <MenuItem danger icon={<LogOut className="h-3.5 w-3.5" />} onClick={() => { void onDisconnect(); close(); }}>
                Disconnect cluster
              </MenuItem>
            </>
          )}
        </Menu>
      </div>

      <div className="shrink-0 px-2 py-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          size="sm"
          shortcut=""
          placeholder="Filter resources…"
          autoFocus={false}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1.5 pb-3">
        {groups.length === 0 && session?.status === "connecting" ? (
          <div className="flex items-center gap-2 px-2 py-3">
            <Spinner label="Discovering API resources…" />
          </div>
        ) : null}

        {filtered.map((group) => {
          const expanded = session?.expandedGroups[group.id] ?? true;
          const GroupIcon = group.icon;
          return (
            <div key={group.id} className="mb-0.5">
              <button
                type="button"
                onClick={() => toggleGroup(clusterId, group.id)}
                className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-theme-text-tertiary transition-colors hover:bg-theme-hover/60 hover:text-theme-text-secondary"
              >
                {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                <GroupIcon className="h-3.5 w-3.5" />
                <span className="truncate">{group.title}</span>
                <span className="ml-auto font-mono text-[9px] font-normal text-theme-text-disabled">
                  {group.resources.length}
                </span>
              </button>
              {expanded ? (
                <div className="mt-0.5 space-y-0.5">
                  {group.resources.map((resource) => {
                    const Icon = getKindIcon(resource.kind, resource.group);
                    const active =
                      selected?.apiVersion === resource.apiVersion && selected?.kind === resource.kind;
                    const count = countFor(counts.counts, clusterId, resource, session?.namespace ?? "all");
                    return (
                      <button
                        key={`${resource.apiVersion}/${resource.kind}`}
                        type="button"
                        onClick={() => selectKind(clusterId, { apiVersion: resource.apiVersion, kind: resource.kind })}
                        title={`${resource.apiVersion} ${resource.kind}${resource.isCrd ? " (CRD)" : ""}`}
                        className={cn(
                          "group flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-left text-[13px] transition-colors",
                          active
                            ? "selection-strong selection-text"
                            : "text-theme-text-secondary hover:bg-theme-hover/70 hover:text-theme-text-primary",
                        )}
                      >
                        <Icon className={cn("h-4 w-4 shrink-0", active ? "text-current" : kindColor(resource.kind))} />
                        <span className="min-w-0 flex-1 truncate">{kindLabel(resource.kind, resource.plural)}</span>
                        {count !== null ? <CountBadge active={active}>{count}</CountBadge> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}

        {session?.discoveryError ? (
          <div className="mx-1 mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
            API discovery is partial: {session.discoveryError}
          </div>
        ) : null}
        {counts.error ? (
          <div className="mx-1 mt-2 flex items-center gap-1 text-[10px] text-theme-text-disabled">
            <RefreshCw className="h-2.5 w-2.5" />
            Counts unavailable
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-theme-border px-2.5 py-1.5 text-[10px] text-theme-text-disabled">
        <span>{session?.info?.namespaces.length ?? 0} namespaces</span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {session?.info?.server ? new URL(session.info.server).host : ""}
        </span>
      </div>
    </aside>
  );
}
