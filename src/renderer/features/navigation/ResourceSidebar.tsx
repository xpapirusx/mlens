import { Fragment, useMemo, useState, type Ref } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  DoorOpen,
  Download,
  GripVertical,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  RefreshCw,
  Settings,
  SlidersHorizontal,
  Star,
} from "lucide-react";
import type { ApiResourceInfo, ClusterSummary } from "@shared/types";
import { useCatalogStore } from "../../stores/catalog-store";
import { useSessionStore } from "../../stores/session-store";
import { applyCatalogMoves, buildResourceGroups, CATALOG_MOVE_MIME, catalogGroupKey, catalogKindKey, filterCatalogItems, filterGroups, isListable, mergeGroupOrder, type ResourceGroup } from "../../lib/catalog";
import { kindColor, kindLabel, getKindIcon } from "../../lib/icons";
import { cn } from "../../lib/cn";
import { CountBadge } from "../../design-system/components/Badge";
import { SearchInput } from "../../design-system/components/SearchInput";
import { Tooltip } from "../../design-system/components/Tooltip";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "../../design-system/components/Menu";
import { Spinner } from "../../design-system/components/Spinner";
import { countFor, useResourceCounts } from "./useResourceCounts";
import { CatalogCustomizeDialog } from "./CatalogCustomizeDialog";
import { errorText } from "../../lib/api";
import { clusterShortName } from "../../lib/short-name";
import { toast } from "../../design-system/components/Toast";

// Stable fallbacks: selector results must keep their identity (React #185).
const EMPTY_RESOURCES: ApiResourceInfo[] = [];
const EMPTY_NAMESPACES: string[] = [];
const EMPTY_GROUPS: Record<string, boolean> = {};
const EMPTY_HIDDEN: string[] = [];
const EMPTY_PINNED: string[] = [];
const EMPTY_MOVES: Record<string, string> = {};

export function ResourceSidebar({
  cluster,
  clusterId,
  width,
  active,
  rootRef,
}: {
  cluster: ClusterSummary | undefined;
  clusterId: string;
  width: number;
  active: boolean;
  /** A15: lets the workspace resize the rail directly during a drag. */
  rootRef?: Ref<HTMLElement>;
}) {
  // A14: field-level session selectors — kindState/dock/drawer writes from
  // the browser no longer re-render the sidebar tree.
  const resources = useSessionStore((state) => state.sessions[clusterId]?.resources) ?? EMPTY_RESOURCES;
  const selectedKind = useSessionStore((state) => state.sessions[clusterId]?.selectedKind) ?? null;
  const selectedNamespaces =
    useSessionStore((state) => state.sessions[clusterId]?.selectedNamespaces) ?? EMPTY_NAMESPACES;
  const expandedGroups = useSessionStore((state) => state.sessions[clusterId]?.expandedGroups) ?? EMPTY_GROUPS;
  const status = useSessionStore((state) => state.sessions[clusterId]?.status);
  const info = useSessionStore((state) => state.sessions[clusterId]?.info) ?? null;
  const discoveryError = useSessionStore((state) => state.sessions[clusterId]?.discoveryError);
  const selectKind = useSessionStore((state) => state.selectKind);
  const toggleGroup = useSessionStore((state) => state.toggleGroup);
  const refreshNamespaces = useSessionStore((state) => state.refreshNamespaces);
  const settings = useCatalogStore((state) => state.settings);
  const updateSettings = useCatalogStore((state) => state.updateSettings);
  const rememberedGroups = settings?.sidebarExpandedGroups ?? EMPTY_GROUPS;
  const hiddenItems = settings?.hiddenCatalogItems ?? EMPTY_HIDDEN;
  const pinnedGroups = settings?.pinnedCatalogGroups ?? EMPTY_PINNED;
  const catalogMoves = settings?.catalogMoves ?? EMPTY_MOVES;
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [draggingItem, setDraggingItem] = useState<string | null>(null);

  /** Persist a group's state globally so a new cluster opens the same way. */
  const rememberGroup = (group: string, expanded: boolean) => {
    void updateSettings({
      sidebarExpandedGroups: { ...(settings?.sidebarExpandedGroups ?? {}), [group]: expanded },
    });
  };
  const disconnect = useCatalogStore((state) => state.disconnect);
  const setActiveCluster = useCatalogStore((state) => state.setActiveCluster);
  const openSettings = useCatalogStore((state) => state.openSettings);
  const dispose = useSessionStore((state) => state.dispose);

  const [search, setSearch] = useState("");
  const searching = search.trim().length > 0;
  const [draggingGroup, setDraggingGroup] = useState<string | null>(null);
  const refreshSeconds = settings?.refreshIntervalSeconds ?? 30;

  const baseGroups = useMemo(() => buildResourceGroups(resources), [resources]);
  const movedGroups = useMemo(
    () => applyCatalogMoves(baseGroups, catalogMoves),
    [baseGroups, catalogMoves],
  );
  const visibleGroups = useMemo(
    () => filterCatalogItems(movedGroups, hiddenItems),
    [movedGroups, hiddenItems],
  );
  const groupOrder = settings?.sidebarGroupOrder ?? [];
  const orderedIds = useMemo(
    () =>
      groupOrder.length > 0
        ? mergeGroupOrder(visibleGroups.map((group) => group.id), groupOrder)
        : [],
    [visibleGroups, groupOrder.join("|")],
  );
  const groups = useMemo(() => {
    const ordered =
      orderedIds.length === 0
        ? [...visibleGroups]
        : [...visibleGroups].sort(
            (a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id),
          );
    if (pinnedGroups.length === 0) return ordered;
    // Stable sort: pinned groups float above the rest, their relative order
    // and the user's drag order stay intact.
    return [...ordered].sort(
      (a, b) =>
        Number(!pinnedGroups.includes(a.id)) - Number(!pinnedGroups.includes(b.id)),
    );
  }, [visibleGroups, orderedIds, pinnedGroups]);
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

  /** A kind or a CRD folder dropped onto a top-level group header. */
  const moveCatalogItem = (raw: string, targetId: string) => {
    try {
      const payload = JSON.parse(raw) as {
        type?: string;
        apiVersion?: string;
        kind?: string;
        groupId?: string;
      };
      const key =
        payload.type === "kind" && payload.apiVersion && payload.kind
          ? catalogKindKey({ apiVersion: payload.apiVersion, kind: payload.kind })
          : payload.type === "group" && payload.groupId
            ? catalogGroupKey(payload.groupId)
            : null;
      if (!key) return;
      void updateSettings({
        catalogMoves: { ...(settings?.catalogMoves ?? {}), [key]: targetId },
      });
    } catch {
      // Ignore malformed drag data.
    }
  };
  const countResources = useMemo(() => {
    // Counts are only for the resource page that is actually open in the
    // browser — not for every expanded/collapsed sidebar dropdown. Nodes and
    // CRD definitions stay exceptions so their rows are useful before opening.
    const list: typeof resources = [];
    const selected = selectedKind;
    if (selected) {
      const current = resources.find(
        (resource) => resource.apiVersion === selected.apiVersion && resource.kind === selected.kind,
      );
      if (current) list.push(current);
    }
    for (const resource of resources) {
      const builtinNode = resource.kind === "Node" && !resource.isCrd;
      if (builtinNode || resource.kind === "CustomResourceDefinition") {
        list.push(resource);
      }
    }
    const unique = new Map<string, (typeof resources)[number]>();
    for (const resource of list) {
      // Synthetic kinds (Helm releases) have no API to count against.
      if (resource.catalogGroup === "helm") continue;
      if (isListable(resource)) unique.set(`${resource.apiVersion}|${resource.kind}`, resource);
    }
    return [...unique.values()];
  }, [resources, selectedKind]);

  const counts = useResourceCounts({
    clusterId,
    namespaces: selectedNamespaces,
    resources: countResources,
    refreshSeconds: active ? refreshSeconds : 0,
  });

  const selected = selectedKind;
  const isFavorite = settings?.favorites.includes(clusterId) ?? false;

  const totalCount = (list: typeof resources): number | null => {
    let total = 0;
    let applicable = 0;
    for (const resource of list) {
      if (!isListable(resource)) continue;
      applicable += 1;
      const count = countFor(counts.counts, resource);
      // A partial sum is worse than no sum: only show a group total when every
      // listable kind in it has been counted.
      if (count === null) return null;
      total += count;
    }
    return applicable > 0 ? total : null;
  };

  const favoriteKeys = settings?.favoriteKinds ?? [];
  const keyFor = (resource: (typeof resources)[number]) => `${resource.apiVersion}|${resource.kind}`;
  const favoriteResources = favoriteKeys
    .map((key) => {
      const [apiVersion, kind] = key.split("|");
      return resources.find((resource) => resource.apiVersion === apiVersion && resource.kind === kind);
    })
    .filter((resource): resource is (typeof resources)[number] => Boolean(resource));

  // Collapsed mode: an icon rail of the catalog's top-level groups. Groups with
  // more than one kind (and Favorites) open an icon list; the active entry is
  // highlighted, tooltips carry the names.
  if (settings?.sidebarCollapsed) {
    const selectedKey = selected ? `${selected.apiVersion}|${selected.kind}` : null;
    const railGroupItems = (group: ResourceGroup, close: () => void): React.ReactNode => (
      <>
        {group.resources.filter(isListable).map((resource) => {
          const Icon = getKindIcon(resource.kind, resource.group);
          const active =
            selected?.apiVersion === resource.apiVersion && selected?.kind === resource.kind;
          return (
            <MenuItem
              key={`${resource.apiVersion}/${resource.kind}`}
              icon={<Icon className="h-3.5 w-3.5" />}
              shortcut={active ? "✓" : undefined}
              onClick={() => {
                selectKind(clusterId, { apiVersion: resource.apiVersion, kind: resource.kind });
                close();
              }}
            >
              {resource.isCrd ? resource.kind : kindLabel(resource.kind, resource.plural)}
            </MenuItem>
          );
        })}
        {(group.children ?? []).map((child) => (
          <Fragment key={child.id}>
            <MenuLabel>{child.title}</MenuLabel>
            {railGroupItems(child, close)}
          </Fragment>
        ))}
      </>
    );
    return (
      <aside
        className="flex h-full min-h-0 w-12 shrink-0 flex-col items-center border-r border-theme-border bg-theme-sidebar py-2"
        aria-label="Resource catalog"
      >
        <div className="mt-2 flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto px-1">
          <RailIconButton
            active={selected?.kind === "__overview__"}
            title="Overview"
            onClick={() => selectKind(clusterId, { apiVersion: "", kind: "__overview__" })}
          >
            <LayoutDashboard className="h-4 w-4" />
          </RailIconButton>
          {favoriteResources.length > 0 ? (
            <Menu
              width={240}
              align="start"
              trigger={({ open, toggle }) => (
                <button
                  type="button"
                  title="Favorites"
                  aria-label="Favorites"
                  onClick={toggle}
                  className={railButtonClass(
                    Boolean(selectedKey && favoriteKeys.includes(selectedKey)) || open,
                  )}
                >
                  <Star className="h-4 w-4" />
                </button>
              )}
            >
              {({ close }) => (
                <>
                  <MenuLabel>Favorites</MenuLabel>
                  {favoriteResources.map((resource) => {
                    const Icon = getKindIcon(resource.kind, resource.group);
                    const active =
                      selected?.apiVersion === resource.apiVersion &&
                      selected?.kind === resource.kind;
                    return (
                      <MenuItem
                        key={`${resource.apiVersion}/${resource.kind}`}
                        icon={<Icon className="h-3.5 w-3.5" />}
                        shortcut={active ? "✓" : undefined}
                        onClick={() => {
                          selectKind(clusterId, {
                            apiVersion: resource.apiVersion,
                            kind: resource.kind,
                          });
                          close();
                        }}
                      >
                        {resource.isCrd ? resource.kind : kindLabel(resource.kind, resource.plural)}
                      </MenuItem>
                    );
                  })}
                </>
              )}
            </Menu>
          ) : null}
          {groups.map((group) => {
            const Icon = group.icon;
            const active = Boolean(
              selected && groupHasKind(group, selected.apiVersion, selected.kind),
            );
            const first = firstGroupResource(group);
            if (countGroupResources(group) <= 1) {
              return (
                <RailIconButton
                  key={group.id}
                  active={active}
                  title={group.title}
                  onClick={() => {
                    if (first) selectKind(clusterId, { apiVersion: first.apiVersion, kind: first.kind });
                  }}
                >
                  <Icon className="h-4 w-4" />
                </RailIconButton>
              );
            }
            return (
              <Menu
                key={group.id}
                width={260}
                align="start"
                trigger={({ open, toggle }) => (
                  <button
                    type="button"
                    title={group.title}
                    aria-label={group.title}
                    onClick={toggle}
                    className={railButtonClass(active || open)}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                )}
              >
                {({ close }) => (
                  <>
                    <MenuLabel>{group.title}</MenuLabel>
                    {railGroupItems(group, close)}
                  </>
                )}
              </Menu>
            );
          })}
        </div>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-md text-theme-text-tertiary transition-colors hover:bg-theme-hover hover:text-theme-text-primary"
          title="Expand catalog (⌘B)"
          aria-label="Expand catalog"
          onClick={() => void updateSettings({ sidebarCollapsed: false })}
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      </aside>
    );
  }

  // Favorites default to expanded — they are pinned on purpose; the chevron
  // only exists to hide them when the rail gets busy.
  const favoritesExpanded = expandedGroups["__favorites"] ?? rememberedGroups["__favorites"] ?? true;

  const renderKindRow = (resource: (typeof resources)[number], depth = 0) => {
    const Icon = getKindIcon(resource.kind, resource.group);
    const active = selected?.apiVersion === resource.apiVersion && selected?.kind === resource.kind;
    const count = countFor(counts.counts, resource);
    const pinned = favoriteKeys.includes(keyFor(resource));
    const indent = depth === 0 ? "pl-2" : depth === 1 ? "pl-6" : "pl-10";
    const itemKey = `${resource.apiVersion}|${resource.kind}`;
    const moved = Boolean(catalogMoves[catalogKindKey(resource)]);
    return (
      <div
        key={`${resource.apiVersion}/${resource.kind}`}
        draggable
        onDragStart={(event) => {
          event.stopPropagation();
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData(
            CATALOG_MOVE_MIME,
            JSON.stringify({
              type: "kind",
              apiVersion: resource.apiVersion,
              kind: resource.kind,
            }),
          );
          setDraggingItem(itemKey);
        }}
        onDragEnd={() => setDraggingItem(null)}
        className={cn(
          "group relative flex w-full items-center rounded-md pr-1.5 text-[calc(13px*var(--font-scale))] transition-colors",
          indent,
          active
            ? "selection-strong selection-text"
            : "text-theme-text-secondary hover:bg-theme-hover/70 hover:text-theme-text-primary",
          draggingItem === itemKey && "opacity-40",
        )}
      >
        <button
          type="button"
          onClick={() => selectKind(clusterId, { apiVersion: resource.apiVersion, kind: resource.kind })}
          title={`${resource.apiVersion} ${resource.kind}${resource.isCrd ? " (CRD)" : ""}`}
          className="flex min-w-0 flex-1 items-center gap-2 py-[5px] text-left"
        >
          <Icon className={cn("h-4 w-4 shrink-0", active ? "text-current" : kindColor(resource.kind))} />
          {moved ? (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-skyhook-500/50"
              title="Moved from another group"
            />
          ) : null}
          {resource.isCrd ? (
            <span className="min-w-0 flex-1 truncate text-[calc(12px*var(--font-scale))]">{resource.kind}</span>
          ) : (
            <span className="min-w-0 flex-1 truncate">{kindLabel(resource.kind, resource.plural)}</span>
          )}
          {count !== null ? <CountBadge active={active}>{count}</CountBadge> : null}
        </button>
        <button
          type="button"
          title={pinned ? "Remove from sidebar favorites" : "Pin to sidebar favorites"}
          className={cn(
            "ml-1 shrink-0 rounded p-0.5 text-theme-text-tertiary hover:bg-theme-hover hover:text-theme-text-primary",
            pinned ? "opacity-100 text-theme-text-secondary" : "opacity-0 group-hover:opacity-100",
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
              const moveRaw = event.dataTransfer.getData(CATALOG_MOVE_MIME);
              if (moveRaw) {
                moveCatalogItem(moveRaw, group.id);
                setDraggingGroup(null);
                setDraggingItem(null);
                return;
              }
              const source = event.dataTransfer.getData("text/plain") || draggingGroup;
              if (source) reorderGroups(source, group.id);
              setDraggingGroup(null);
              setDraggingItem(null);
            },
            onDragEnd: () => setDraggingGroup(null),
          }
        : {};
    const moveHandlers =
      depth > 0 && !searching
        ? {
            draggable: true,
            onDragStart: (event: React.DragEvent) => {
              event.stopPropagation();
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData(
                CATALOG_MOVE_MIME,
                JSON.stringify({ type: "group", groupId: group.id }),
              );
              setDraggingItem(group.id);
            },
            onDragEnd: () => setDraggingItem(null),
          }
        : {};

    if (group.standalone && group.resources.length <= 1) {
      return (
        <div key={group.id} {...dragHandlers} className={cn(draggingGroup === group.id && "opacity-40")}>
          {group.resources[0] ? renderKindRow(group.resources[0], 0) : null}
        </div>
      );
    }
    const defaultExpanded = !(settings?.collapseCatalogGroups ?? true);
    // Search opens everything (unless the user explicitly collapsed a group
    // during the search); otherwise the session → global memory → default.
    const expanded = searching
      ? (expandedGroups[group.id] ?? true)
      : (expandedGroups[group.id] ?? rememberedGroups[group.id] ?? defaultExpanded);
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
        {...moveHandlers}
        className={cn(
          "mb-0.5",
          depth > 0 && "mt-0.5",
          draggingGroup === group.id && "opacity-40",
          draggingItem === group.id && "opacity-40",
        )}
      >
        <button
          type="button"
          onClick={() => {
            toggleGroup(clusterId, group.id, expanded);
            rememberGroup(group.id, !expanded);
          }}
          className={cn(
            "group flex h-8 w-full items-center rounded-md pr-2 font-semibold text-theme-text-tertiary transition-colors hover:bg-theme-hover/60 hover:text-theme-text-secondary",
            // Level 1 mirrors a kind row exactly (pl-2 + 16px icon + gap-2), so
            // every top-level name starts at the same x; the chevron and the
            // drag grip live on the right instead of pushing the name inward.
            depth > 0
              ? "pl-4 gap-1.5 text-[calc(12px*var(--font-scale))] normal-case tracking-normal"
              : "pl-2 gap-2 text-[calc(11px*var(--font-scale))] uppercase tracking-wider",
          )}
        >
          {depth === 0 ? <GroupIcon className="h-4 w-4 shrink-0" /> : null}
          <span className="truncate">{group.title}</span>
          {depth > 0 && catalogMoves[catalogGroupKey(group.id)] ? (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-skyhook-500/50"
              title="Moved from another group"
            />
          ) : null}
          <span className="ml-auto shrink-0 font-mono text-[calc(9px*var(--font-scale))] font-normal text-theme-text-disabled">
            {expanded ? (aggregate ?? kindCount) : kindCount}
          </span>
          {expanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
          {depth === 0 ? (
            <GripVertical className="h-3 w-3 shrink-0 cursor-grab text-theme-text-disabled opacity-0 group-hover:opacity-100" />
          ) : null}
        </button>
        {expanded ? (
          <div className="space-y-0.5">
            {group.resources.map((resource) => renderKindRow(resource, depth + 1))}
            {group.children?.map((child) => renderGroup(child, depth + 1))}
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
      ref={rootRef}
      className="flex h-full min-h-0 shrink-0 flex-col border-r border-theme-border bg-theme-sidebar"
      style={{ width }}
      aria-label="Resource catalog"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-theme-border px-2.5 py-2.5">
        <div className="relative">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-skyhook-500 to-skyhook-800 text-[calc(11px*var(--font-scale))] font-semibold text-white shadow-theme-sm">
            {clusterShortName(cluster?.name)}
          </div>
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-theme-sidebar",
              status === "connected" ? "bg-emerald-500" : status === "error" ? "bg-red-500" : "bg-amber-500",
            )}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[calc(13px*var(--font-scale))] font-semibold text-theme-text-primary" title={cluster?.name}>
            {cluster?.name ?? "Cluster"}
          </div>
          <div className="flex items-center gap-1.5 truncate text-[calc(10px*var(--font-scale))] text-theme-text-tertiary">
            <span>{info?.version ? `v${info.version}` : "connecting…"}</span>
            {/* <span className="text-theme-text-disabled">·</span>
            <span className="truncate">{session?.info?.user ?? cluster?.context}</span> */}
          </div>
        </div>
        <button
          type="button"
          className="shell-icon-button h-6 w-6"
          title="Customize catalog"
          aria-label="Customize catalog"
          onClick={() => setCustomizeOpen(true)}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
        </button>
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
              "mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[calc(13px*var(--font-scale))] transition-colors",
              selected?.kind === "__overview__"
                ? "selection-strong selection-text"
                : "text-theme-text-secondary hover:bg-theme-hover/70 hover:text-theme-text-primary",
            )}
          >
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left">Overview</span>
          </button>
        ) : null}

        {groups.length === 0 && status === "connecting" ? (
          <div className="flex items-center gap-2 px-2 py-3">
            <Spinner label="Discovering API resources…" />
          </div>
        ) : null}

        {!searching && favoriteResources.length > 0 ? (
          <div className="mb-1">
            <button
              type="button"
              onClick={() => {
                toggleGroup(clusterId, "__favorites", favoritesExpanded);
                rememberGroup("__favorites", !favoritesExpanded);
              }}
              className="group flex h-8 w-full items-center gap-2 rounded-md pl-2 pr-2 text-[calc(11px*var(--font-scale))] font-semibold uppercase tracking-wider text-theme-text-tertiary transition-colors hover:bg-theme-hover/60 hover:text-theme-text-secondary"
              title={favoritesExpanded ? "Collapse favorites" : "Expand favorites"}
            >
              <Star className="h-4 w-4 shrink-0 fill-current" />
              <span className="truncate">Favorites</span>
              <span className="ml-auto shrink-0 font-mono text-[calc(9px*var(--font-scale))] font-normal text-theme-text-disabled">
                {favoriteResources.length}
              </span>
              {favoritesExpanded ? (
                <ChevronDown className="h-3 w-3 shrink-0" />
              ) : (
                <ChevronRight className="h-3 w-3 shrink-0" />
              )}
            </button>
            {favoritesExpanded ? (
              <div className="space-y-0.5">
                {favoriteResources.map((resource) => renderKindRow(resource, 0))}
              </div>
            ) : null}
            {/* Separates the pinned kinds from the ordered menu below. */}
            <div className="mx-1.5 mb-1 mt-1 h-px bg-theme-border/70" />
          </div>
        ) : null}

        {filtered.map((group) => renderGroup(group))}

        {discoveryError ? (
          <div className="mx-1 mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[calc(11px*var(--font-scale))] text-amber-700 dark:text-amber-300">
            API discovery is partial: {discoveryError}
          </div>
        ) : null}
        {counts.error ? (
          <div className="mx-1 mt-2 flex items-center gap-1 text-[calc(10px*var(--font-scale))] text-theme-text-disabled">
            <RefreshCw className="h-2.5 w-2.5" />
            Counts unavailable
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center justify-center px-1 pb-1.5">
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-md text-theme-text-tertiary transition-colors hover:bg-theme-hover hover:text-theme-text-primary"
          title="Collapse catalog (⌘B)"
          aria-label="Collapse catalog"
          onClick={() => void updateSettings({ sidebarCollapsed: true })}
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-theme-border px-2.5 py-1.5 text-[calc(10px*var(--font-scale))] text-theme-text-disabled">
        <Tooltip content={`${info?.namespaces.length ?? 0} namespaces`} side="bottom" delay={140}>
          <span className="shrink-0">{info?.namespaces.length ?? 0} namespaces</span>
        </Tooltip>
        <Tooltip
          content={info?.server ?? ""}
          side="bottom"
          delay={140}
          wrapperClassName="flex min-w-0 flex-1 justify-end"
        >
          <span className="flex min-w-0 items-center gap-1">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
            <span className="min-w-0 truncate">
              {info?.server ? info.server.replace(/^https?:\/\//, "") : ""}
            </span>
          </span>
        </Tooltip>
      </div>

      <CatalogCustomizeDialog
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        groups={movedGroups}
      />
    </aside>
  );
}

function railButtonClass(active: boolean): string {
  return cn(
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors",
    active
      ? "selection-strong selection-text"
      : "text-theme-text-tertiary hover:bg-theme-hover hover:text-theme-text-primary",
  );
}

function countGroupResources(group: ResourceGroup): number {
  return (
    group.resources.filter(isListable).length +
    (group.children ?? []).reduce((sum, child) => sum + countGroupResources(child), 0)
  );
}

function groupHasKind(group: ResourceGroup, apiVersion: string, kind: string): boolean {
  return (
    group.resources.some((resource) => resource.apiVersion === apiVersion && resource.kind === kind) ||
    (group.children ?? []).some((child) => groupHasKind(child, apiVersion, kind))
  );
}

function firstGroupResource(group: ResourceGroup): ApiResourceInfo | undefined {
  return (
    group.resources.find(isListable) ??
    group.children?.flatMap((child) => child.resources).find(isListable)
  );
}

function RailIconButton({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={railButtonClass(active)}
    >
      {children}
    </button>
  );
}
