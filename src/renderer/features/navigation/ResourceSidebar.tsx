import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  DoorOpen,
  Download,
  GripVertical,
  LayoutDashboard,
  LogOut,
  Pin,
  RefreshCw,
  Settings,
  Star,
} from "lucide-react";
import type { ClusterSummary } from "@shared/types";
import { useCatalogStore } from "../../stores/catalog-store";
import { useSessionStore } from "../../stores/session-store";
import { buildResourceGroups, filterGroups, isListable, type ResourceGroup } from "../../lib/catalog";
import { kindColor, kindLabel, getKindIcon } from "../../lib/icons";
import { cn } from "../../lib/cn";
import { CountBadge } from "../../design-system/components/Badge";
import { SearchInput } from "../../design-system/components/SearchInput";
import { Menu, MenuItem, MenuSeparator } from "../../design-system/components/Menu";
import { Spinner } from "../../design-system/components/Spinner";
import { countFor, useResourceCounts } from "./useResourceCounts";
import { errorText } from "../../lib/api";
import { toast } from "../../design-system/components/Toast";

export function ResourceSidebar({
  cluster,
  clusterId,
  width,
  active,
}: {
  cluster: ClusterSummary | undefined;
  clusterId: string;
  width: number;
  active: boolean;
}) {
  const session = useSessionStore((state) => state.sessions[clusterId]);
  const selectKind = useSessionStore((state) => state.selectKind);
  const toggleGroup = useSessionStore((state) => state.toggleGroup);
  const refreshNamespaces = useSessionStore((state) => state.refreshNamespaces);
  const settings = useCatalogStore((state) => state.settings);
  const updateSettings = useCatalogStore((state) => state.updateSettings);
  const disconnect = useCatalogStore((state) => state.disconnect);
  const setActiveCluster = useCatalogStore((state) => state.setActiveCluster);
  const openSettings = useCatalogStore((state) => state.openSettings);
  const dispose = useSessionStore((state) => state.dispose);

  const [search, setSearch] = useState("");
  const searching = search.trim().length > 0;
  const [draggingGroup, setDraggingGroup] = useState<string | null>(null);
  const refreshSeconds = settings?.refreshIntervalSeconds ?? 30;

  const resources = session?.resources ?? [];
  const baseGroups = useMemo(() => buildResourceGroups(resources), [resources]);
  const groupOrder = settings?.sidebarGroupOrder ?? [];
  const groups = useMemo(() => {
    if (groupOrder.length === 0) return baseGroups;
    return [...baseGroups].sort((a, b) => {
      const ai = groupOrder.indexOf(a.id);
      const bi = groupOrder.indexOf(b.id);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [baseGroups, groupOrder.join("|")]);
  const filtered = useMemo(() => filterGroups(groups, search), [groups, search]);

  const reorderGroups = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const ids = groups.map((group) => group.id);
    const from = ids.indexOf(sourceId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, sourceId);
    void updateSettings({ sidebarGroupOrder: ids });
  };
  const countResources = useMemo(() => {
    const defaultExpanded = !(settings?.collapseCatalogGroups ?? true);
    const isOpen = (id: string) => searching || (session?.expandedGroups[id] ?? defaultExpanded);
    const list: typeof resources = [];
    for (const group of groups) {
      if (group.standalone) {
        list.push(...group.resources);
      } else if (group.children) {
        if (isOpen(group.id)) {
          for (const child of group.children) {
            if (isOpen(child.id)) list.push(...child.resources);
          }
        }
      } else if (isOpen(group.id)) {
        list.push(...group.resources);
      }
    }
    for (const key of settings?.favoriteKinds ?? []) {
      const [apiVersion, kind] = key.split("|");
      const found = resources.find((resource) => resource.apiVersion === apiVersion && resource.kind === kind);
      if (found) list.push(found);
    }
    const unique = new Map<string, (typeof resources)[number]>();
    for (const resource of list) {
      if (isListable(resource)) unique.set(`${resource.apiVersion}|${resource.kind}`, resource);
    }
    return [...unique.values()];
  }, [
    groups,
    resources,
    searching,
    session?.expandedGroups,
    settings?.collapseCatalogGroups,
    settings?.favoriteKinds,
  ]);

  const counts = useResourceCounts({
    clusterId,
    namespaces: session?.selectedNamespaces ?? [],
    resources: countResources,
    refreshSeconds: active ? refreshSeconds : 0,
  });

  const selected = session?.selectedKind;
  const isFavorite = settings?.favorites.includes(clusterId) ?? false;

  const totalCount = (list: typeof resources): number | null => {
    let total = 0;
    let found = false;
    for (const resource of list) {
      if (!isListable(resource)) continue;
      const count = countFor(counts.counts, resource);
      if (count !== null) {
        total += count;
        found = true;
      }
    }
    return found ? total : null;
  };

  const favoriteKeys = settings?.favoriteKinds ?? [];
  const keyFor = (resource: (typeof resources)[number]) => `${resource.apiVersion}|${resource.kind}`;
  const favoriteResources = favoriteKeys
    .map((key) => {
      const [apiVersion, kind] = key.split("|");
      return resources.find((resource) => resource.apiVersion === apiVersion && resource.kind === kind);
    })
    .filter((resource): resource is (typeof resources)[number] => Boolean(resource));

  const renderKindRow = (resource: (typeof resources)[number], depth = 0) => {
    const Icon = getKindIcon(resource.kind, resource.group);
    const active = selected?.apiVersion === resource.apiVersion && selected?.kind === resource.kind;
    const count = countFor(counts.counts, resource);
    const pinned = favoriteKeys.includes(keyFor(resource));
    const indent = depth === 0 ? "pl-2" : depth === 1 ? "pl-6" : "pl-10";
    return (
      <div
        key={`${resource.apiVersion}/${resource.kind}`}
        className={cn(
          "group relative flex w-full items-center rounded-md pr-1.5 text-[13px] transition-colors",
          indent,
          active
            ? "selection-strong selection-text"
            : "text-theme-text-secondary hover:bg-theme-hover/70 hover:text-theme-text-primary",
        )}
      >
        <button
          type="button"
          onClick={() => selectKind(clusterId, { apiVersion: resource.apiVersion, kind: resource.kind })}
          title={`${resource.apiVersion} ${resource.kind}${resource.isCrd ? " (CRD)" : ""}`}
          className="flex min-w-0 flex-1 items-center gap-2 py-[5px] text-left"
        >
          <Icon className={cn("h-4 w-4 shrink-0", active ? "text-current" : kindColor(resource.kind))} />
          {resource.isCrd ? (
            <span className="min-w-0 flex-1 truncate text-[12px]">{resource.kind}</span>
          ) : (
            <span className="min-w-0 flex-1 truncate">{kindLabel(resource.kind, resource.plural)}</span>
          )}
          {count !== null ? <CountBadge active={active}>{count}</CountBadge> : null}
        </button>
        <button
          type="button"
          title={pinned ? "Remove from sidebar favorites" : "Pin to sidebar favorites"}
          className={cn(
            "ml-1 shrink-0 rounded p-0.5 text-theme-text-tertiary hover:bg-theme-hover hover:text-amber-500",
            pinned ? "opacity-100 text-amber-500" : "opacity-0 group-hover:opacity-100",
          )}
          onClick={(event) => {
            event.stopPropagation();
            const key = keyFor(resource);
            void updateSettings({
              favoriteKinds: pinned
                ? favoriteKeys.filter((entry) => entry !== key)
                : [...favoriteKeys, key],
            });
          }}
        >
          <Pin className={cn("h-3 w-3", pinned && "fill-current")} />
        </button>
      </div>
    );
  };

  const renderGroup = (group: ResourceGroup, depth = 0) => {
    const dragHandlers =
      depth === 0 && !searching
        ? {
            draggable: true,
            onDragStart: (event: React.DragEvent) => {
              setDraggingGroup(group.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", group.id);
            },
            onDragOver: (event: React.DragEvent) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            },
            onDrop: (event: React.DragEvent) => {
              event.preventDefault();
              const source = event.dataTransfer.getData("text/plain") || draggingGroup;
              if (source) reorderGroups(source, group.id);
              setDraggingGroup(null);
            },
            onDragEnd: () => setDraggingGroup(null),
          }
        : {};

    if (group.standalone) {
      return (
        <div key={group.id} {...dragHandlers} className={cn(draggingGroup === group.id && "opacity-40")}>
          {renderKindRow(group.resources[0], 0)}
        </div>
      );
    }
    const defaultExpanded = searching ? true : !(settings?.collapseCatalogGroups ?? true);
    const expanded = session?.expandedGroups[group.id] ?? defaultExpanded;
    const GroupIcon = group.icon;
    const kindCount = group.children
      ? group.children.reduce((sum, child) => sum + child.resources.length, 0)
      : group.resources.length;
    const aggregate = group.children
      ? totalCount(group.children.flatMap((child) => child.resources))
      : totalCount(group.resources);

    return (
      <div
        key={group.id}
        {...dragHandlers}
        className={cn("mb-0.5", depth > 0 && "mt-0.5", draggingGroup === group.id && "opacity-40")}
      >
        <button
          type="button"
          onClick={() => toggleGroup(clusterId, group.id, expanded)}
          className={cn(
            "group flex h-8 w-full items-center gap-1.5 rounded-md pr-2 font-semibold text-theme-text-tertiary transition-colors hover:bg-theme-hover/60 hover:text-theme-text-secondary",
            depth > 0 || group.id === "custom"
              ? "pl-4 text-[12px] normal-case tracking-normal"
              : "pl-1.5 text-[11px] uppercase tracking-wider",
            group.id === "custom" && "pl-1.5",
          )}
        >
          {depth === 0 ? (
            <GripVertical className="h-3 w-3 shrink-0 cursor-grab text-theme-text-disabled opacity-0 group-hover:opacity-100" />
          ) : null}
          {expanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
          {depth === 0 && group.id !== "custom" ? (
            <GroupIcon className="h-3.5 w-3.5 shrink-0" />
          ) : null}
          <span className="truncate">{group.title}</span>
          <span className="ml-auto shrink-0 font-mono text-[9px] font-normal text-theme-text-disabled">
            {aggregate ?? kindCount}
          </span>
        </button>
        {expanded ? (
          <div className="space-y-0.5">
            {group.children
              ? group.children.map((child) => renderGroup(child, depth + 1))
              : group.resources.map((resource) => renderKindRow(resource, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  };

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
                  void refreshNamespaces(clusterId)
                    .then(() => toast.success("Namespaces refreshed"))
                    .catch((error) => toast.error("Cannot refresh namespaces", errorText(error)));
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
        {!searching ? (
          <button
            type="button"
            onClick={() => selectKind(clusterId, { apiVersion: "", kind: "__overview__" })}
            className={cn(
              "mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors",
              selected?.kind === "__overview__"
                ? "selection-strong selection-text"
                : "text-theme-text-secondary hover:bg-theme-hover/70 hover:text-theme-text-primary",
            )}
          >
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left">Overview</span>
          </button>
        ) : null}

        {groups.length === 0 && session?.status === "connecting" ? (
          <div className="flex items-center gap-2 px-2 py-3">
            <Spinner label="Discovering API resources…" />
          </div>
        ) : null}

        {!searching && favoriteResources.length > 0 ? (
          <div className="mb-1">
            <div className="flex items-center gap-1.5 px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              <Star className="h-3 w-3 fill-current" />
              Favorites
            </div>
            <div className="space-y-0.5">
              {favoriteResources.map((resource) => renderKindRow(resource, 0))}
            </div>
          </div>
        ) : null}

        {filtered.map((group) => renderGroup(group))}

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
        <span className="flex min-w-0 items-center gap-1" title={session?.info?.server}>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
          <span className="max-w-[130px] truncate">
            {session?.info?.server ? session.info.server.replace(/^https?:\/\//, "") : ""}
          </span>
        </span>
      </div>
    </aside>
  );
}
