import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpDown,
  Blocks,
  ChevronRight,
  Clock,
  Copy,
  FolderOpen,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Server,
  Settings,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import type { ClusterSummary } from "@shared/types";
import { useCatalogStore } from "../../stores/catalog-store";
import { useChromeSessions } from "../../stores/session-store";
import { useAppInfo } from "../../lib/use-app-info";
import { cn } from "../../lib/cn";
import { formatRelativeTime, basename } from "../../lib/format";
import { openCluster, disconnectCluster } from "../../lib/cluster-actions";
import { clusterShortName } from "../../lib/short-name";
import { resolveClusterColor } from "../../lib/cluster-color";
import { Button } from "../../design-system/components/Button";
import { SearchInput } from "../../design-system/components/SearchInput";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "../../design-system/components/Menu";
import { Modal } from "../../design-system/components/Modal";
import { ConfirmActionDialog } from "../resource-browser/ResourceDialogs";
import { EmptyState } from "../../design-system/components/EmptyState";
import { Spinner } from "../../design-system/components/Spinner";
import { toast } from "../../design-system/components/Toast";
import { api, call, errorText } from "../../lib/api";

type CatalogView = "all" | "favorites" | "recent" | "removed" | { source: string };

const isMac = window.mlens.platform === "darwin";

export function CatalogPage() {
  const clusters = useCatalogStore((state) => state.clusters);
  const allClusters = useCatalogStore((state) => state.allClusters);
  const setHiddenClusters = useCatalogStore((state) => state.setHiddenClusters);
  const sources = useCatalogStore((state) => state.sources);
  const settings = useCatalogStore((state) => state.settings);
  const health = useCatalogStore((state) => state.health);
  const loading = useCatalogStore((state) => state.loadingCatalog);
  const catalogError = useCatalogStore((state) => state.catalogError);
  const loadCatalog = useCatalogStore((state) => state.loadCatalog);
  const importViaDialog = useCatalogStore((state) => state.importViaDialog);
  const removeKubeconfig = useCatalogStore((state) => state.removeKubeconfig);
  const openSettings = useCatalogStore((state) => state.openSettings);
  const updateSettings = useCatalogStore((state) => state.updateSettings);
  const sessions = useChromeSessions();
  const info = useAppInfo();

  const [view, setView] = useState<CatalogView>("all");
  const [search, setSearch] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteYaml, setPasteYaml] = useState("");
  const [pasteName, setPasteName] = useState("pasted-kubeconfig");
  const [busy, setBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmRemove, setConfirmRemove] = useState(false);
  // Persisted in settings so the catalog reopens with the same order.
  const sortBy = settings?.catalogSort ?? "status";
  const searchRef = useRef<HTMLInputElement>(null);

  // ⌘F / Ctrl+F focuses the catalog search (the cluster search is the page's
  // primary filter; there is no browser find inside the app).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod || event.key.toLowerCase() !== "f") return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "TEXTAREA" || target?.isContentEditable) return;
      event.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const favorites = settings?.favorites ?? [];
  const sidebarCollapsed = settings?.sidebarCollapsed ?? false;

  const hiddenIds = settings?.hiddenClusters ?? [];
  const hiddenSet = new Set(hiddenIds);
  const removedClusters = allClusters.filter((cluster) => hiddenSet.has(cluster.id));

  const filtered = useMemo(() => {
    let list = view === "removed" ? removedClusters : clusters;
    if (view === "favorites") list = list.filter((cluster) => favorites.includes(cluster.id));
    else if (typeof view === "object") list = list.filter((cluster) => cluster.kubeconfigPath === view.source);
    else if (view === "recent") {
      // Recent is a filtered view; its order is applied below and always
      // follows `recentClusters`, even when another sort was remembered.
      const recentIds = new Set((settings?.recentClusters ?? []).map((entry) => entry.id));
      list = list.filter((cluster) => recentIds.has(cluster.id));
    }
    const term = search.trim().toLowerCase();
    if (term) {
      list = list.filter((cluster) =>
        [cluster.name, cluster.context, cluster.server, cluster.kubeconfigPath]
          .join(" ")
          .toLowerCase()
          .includes(term),
      );
    }
    if (view !== "removed") {
      const recentOrder = new Map((settings?.recentClusters ?? []).map((entry, index) => [entry.id, index]));
      if (view === "recent" || sortBy === "recent") {
        // "Recent" (view or sort) always lists the most recently opened first.
        list = [...list].sort(
          (left, right) => (recentOrder.get(left.id) ?? 9999) - (recentOrder.get(right.id) ?? 9999),
        );
      } else if (sortBy === "name") {
        list = [...list].sort((left, right) => left.name.localeCompare(right.name));
      } else if (sortBy === "source") {
        list = [...list].sort(
          (left, right) =>
            left.kubeconfigPath.localeCompare(right.kubeconfigPath) || left.name.localeCompare(right.name),
        );
      } else {
        // Open clusters (a live session exists) float to the top; connected
        // first, then connecting/error, then everything else by name.
        const rank = (id: string) => {
          const status = sessions[id]?.status;
          if (status === "connected") return 0;
          if (status === "connecting") return 1;
          if (sessions[id]) return 2;
          return 3;
        };
        list = [...list].sort(
          (left, right) => rank(left.id) - rank(right.id) || left.name.localeCompare(right.name),
        );
      }
    }
    return list;
  }, [clusters, removedClusters, favorites, view, search, settings?.recentClusters, sessions, sortBy]);

  const connectedCount = clusters.filter((cluster) => sessions[cluster.id]?.status === "connected").length;

  const toggleFavorite = (id: string) => {
    void updateSettings({
      favorites: favorites.includes(id) ? favorites.filter((entry) => entry !== id) : [...favorites, id],
    });
  };

  const paste = async () => {
    setBusy(true);
    try {
      const source = await call(api.clusters.addKubeconfigContent(pasteYaml, pasteName));
      await loadCatalog();
      setPasteOpen(false);
      setPasteYaml("");
      toast.success("Kubeconfig imported", `${source.contextCount} contexts added`);
    } catch (error) {
      toast.error("Import failed", errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const statusOf = (cluster: ClusterSummary) => {
    if (hiddenSet.has(cluster.id)) return { text: "Removed", tone: "idle" as const };
    const session = sessions[cluster.id];
    if (session?.status === "connected") return { text: "Connected", tone: "connected" as const };
    if (session?.status === "connecting") return { text: "Connecting…", tone: "connecting" as const };
    if (session?.status === "error" || health[cluster.id]?.status === "error") return { text: "Error", tone: "error" as const };
    if (health[cluster.id]?.status === "disconnected") return { text: "Disconnected", tone: "idle" as const };
    return { text: "Not connected", tone: "idle" as const };
  };

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {sidebarCollapsed ? (
        <aside className="flex w-12 shrink-0 flex-col items-center border-r border-theme-border bg-theme-sidebar py-2">

          <div className="mt-2 flex flex-col items-center gap-1">
            {[
              { title: "All clusters", icon: Server, active: view === "all", onClick: () => setView("all") },
              {
                title: "Favorites",
                icon: Star,
                active: view === "favorites",
                onClick: () => setView("favorites"),
              },
              { title: "Recent", icon: Clock, active: view === "recent", onClick: () => setView("recent") },
              ...(hiddenIds.length > 0
                ? [
                    {
                      title: "Removed",
                      icon: Trash2,
                      active: view === "removed",
                      onClick: () => setView("removed"),
                    },
                  ]
                : []),
            ].map((entry) => {
              const Icon = entry.icon;
              return (
                <button
                  key={entry.title}
                  type="button"
                  title={entry.title}
                  aria-label={entry.title}
                  onClick={entry.onClick}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                    entry.active
                      ? "selection-strong selection-text"
                      : "text-theme-text-tertiary hover:bg-theme-hover hover:text-theme-text-primary",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </button>
              );
            })}
            {sources.length > 0 ? (
              <Menu
                width={240}
                align="start"
                trigger={({ open, toggle }) => (
                  <button
                    type="button"
                    title="Kubeconfig sources"
                    aria-label="Kubeconfig sources"
                    onClick={toggle}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                      (typeof view === "object" || open)
                        ? "selection-strong selection-text"
                        : "text-theme-text-tertiary hover:bg-theme-hover hover:text-theme-text-primary",
                    )}
                  >
                    <FolderOpen className="h-4 w-4" />
                  </button>
                )}
              >
                {({ close }) => (
                  <>
                    <MenuLabel>Kubeconfig sources</MenuLabel>
                    {sources.map((source) => (
                      <MenuItem
                        key={source.path}
                        icon={<FolderOpen className="h-3.5 w-3.5" />}
                        shortcut={
                          typeof view === "object" && view.source === source.path ? "✓" : undefined
                        }
                        onClick={() => {
                          setView({ source: source.path });
                          close();
                        }}
                      >
                        {basename(source.path)}
                      </MenuItem>
                    ))}
                  </>
                )}
              </Menu>
            ) : null}
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md text-theme-text-tertiary transition-colors hover:bg-theme-hover hover:text-theme-text-primary"
            title="Expand catalog (⌘B)"
            aria-label="Expand catalog"
            onClick={() => void updateSettings({ sidebarCollapsed: false })}
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
          </div>
        </aside>
      ) : (
      <aside className="flex w-52 shrink-0 flex-col border-r border-theme-border bg-theme-sidebar">
        <div className="flex h-10 items-center gap-2 border-b border-theme-border px-3">
          <Blocks className="h-4 w-4 text-accent-text" />
          <span className="text-[calc(12px*var(--font-scale))] font-semibold text-theme-text-primary">Catalog</span>
        </div>
        <div className="space-y-0.5 p-1.5">
          <NavRow
            icon={<Server className="h-3.5 w-3.5" />}
            label="All clusters"
            count={clusters.length}
            active={view === "all"}
            onClick={() => setView("all")}
          />
          <NavRow
            icon={<Star className="h-3.5 w-3.5" />}
            label="Favorites"
            count={favorites.length}
            active={view === "favorites"}
            onClick={() => setView("favorites")}
          />
          <NavRow
            icon={<Clock className="h-3.5 w-3.5" />}
            label="Recent"
            count={settings?.recentClusters.length ?? 0}
            active={view === "recent"}
            onClick={() => setView("recent")}
          />
          {hiddenIds.length > 0 ? (
            <NavRow
              icon={<Trash2 className="h-3.5 w-3.5" />}
              label="Removed"
              count={hiddenIds.length}
              active={view === "removed"}
              onClick={() => setView("removed")}
            />
          ) : null}
        </div>

        <div className="mt-2 flex items-center justify-between px-3 py-1 text-[calc(10px*var(--font-scale))] font-semibold uppercase tracking-wider text-theme-text-tertiary">
          <span>Kubeconfigs</span>
          <button
            type="button"
            className="rounded p-0.5 text-theme-text-tertiary hover:bg-theme-hover hover:text-theme-text-primary"
            title="Import kubeconfig"
            onClick={() => void importViaDialog()}
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1.5 pb-2">
          {sources.map((source) => (
            <button
              key={source.path}
              type="button"
              onClick={() => setView({ source: source.path })}
              className={cn(
                "group flex w-full items-start gap-1.5 rounded-md px-1.5 py-1.5 text-left transition-colors",
                typeof view === "object" && view.source === source.path
                  ? "selection-strong selection-text"
                  : "text-theme-text-secondary hover:bg-theme-hover/70",
              )}
              title={source.path}
            >
              <FolderOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-theme-text-tertiary" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[calc(11px*var(--font-scale))]">{basename(source.path)}</span>
                <span className="block truncate text-[calc(9px*var(--font-scale))] text-theme-text-disabled">
                  {source.error ? "invalid" : `${source.contextCount} contexts`}
                  {source.isDefault ? " · default" : ""}
                </span>
              </span>
              <button
                type="button"
                title="Remove kubeconfig from catalog"
                className="mt-0.5 hidden rounded p-0.5 text-theme-text-tertiary hover:text-red-500 group-hover:block"
                onClick={(event) => {
                  event.stopPropagation();
                  void removeKubeconfig(source.path);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </button>
          ))}
          {sources.length === 0 ? (
            <div className="px-2 py-2 text-[calc(10px*var(--font-scale))] text-theme-text-disabled">No kubeconfig sources.</div>
          ) : null}
        </div>

        <div className="border-t border-theme-border p-2">
          <Button size="sm" variant="secondary" className="w-full justify-center" onClick={() => setPasteOpen(true)}>
            <Upload className="h-3.5 w-3.5" />
            Paste kubeconfig
          </Button>
          <button
            type="button"
            className="mt-1 flex h-7 w-full items-center justify-center rounded-md text-theme-text-tertiary transition-colors hover:bg-theme-hover hover:text-theme-text-primary"
            title="Collapse catalog (⌘B)"
            aria-label="Collapse catalog"
            onClick={() => void updateSettings({ sidebarCollapsed: true })}
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
      </aside>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto bg-theme-base">
        <div className="border-b border-theme-border bg-gradient-to-b from-theme-surface to-theme-base px-6 py-5">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-skyhook-400 to-skyhook-800 text-white shadow-theme-md">
              <Blocks className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-semibold text-theme-text-primary">Welcome to mLens</h1>
              <p className="mt-0.5 max-w-2xl text-[calc(12px*var(--font-scale))] leading-relaxed text-theme-text-secondary">
                A desktop Kubernetes IDE. Clusters come from your kubeconfig files,
                and every cluster keeps its own session, tabs and navigation.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-4 rounded-lg border border-theme-border bg-theme-surface px-3 py-2 text-center sm:flex">
                <Stat label="Clusters" value={clusters.length} />
                <span className="h-6 w-px bg-theme-border" />
                <Stat label="Connected" value={connectedCount} tone="success" />
                <span className="h-6 w-px bg-theme-border" />
                <Stat label="Kubeconfigs" value={sources.length} />
              </div>
              <Button variant="primary" onClick={() => void importViaDialog()}>
                <Upload className="h-3.5 w-3.5" />
                Import kubeconfig
              </Button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 border-b border-theme-border px-6 py-2.5">
          <h2 className="text-[calc(13px*var(--font-scale))] font-semibold text-theme-text-primary">
            {view === "all"
              ? "All clusters"
              : view === "favorites"
                ? "Favorite clusters"
                : view === "recent"
                  ? "Recent clusters"
                  : view === "removed"
                    ? "Removed from catalog"
                    : basename(view.source)}
          </h2>
          <span className="font-mono text-[calc(10px*var(--font-scale))] text-theme-text-tertiary">{filtered.length}</span>
          <label className="ml-1 flex cursor-pointer items-center gap-1 text-[calc(10px*var(--font-scale))] text-theme-text-tertiary">
            <input
              type="checkbox"
              checked={filtered.length > 0 && filtered.every((cluster) => selectedIds.has(cluster.id))}
              onChange={() => {
                setSelectedIds((current) => {
                  const all = filtered.every((cluster) => current.has(cluster.id));
                  const next = new Set(current);
                  for (const cluster of filtered) {
                    if (all) next.delete(cluster.id);
                    else next.add(cluster.id);
                  }
                  return next;
                });
              }}
              className="h-3 w-3 rounded border-theme-border accent-skyhook-500"
            />
            Select all
          </label>
          {typeof view === "object" ? (
            <button
              type="button"
              className="text-[calc(10px*var(--font-scale))] text-theme-text-tertiary hover:text-theme-text-primary"
              onClick={() => setView("all")}
            >
              clear
            </button>
          ) : null}
          <div className="ml-auto flex w-auto items-center gap-2">
            <Menu
              width={200}
              align="end"
              trigger={({ open, toggle }) => (
                <button
                  type="button"
                  onClick={toggle}
                  className={cn(
                    "flex h-8 items-center gap-1.5 rounded-lg border border-theme-border bg-theme-surface px-2 text-[calc(11px*var(--font-scale))] text-theme-text-secondary hover:bg-theme-hover",
                    open && "bg-theme-hover text-theme-text-primary",
                  )}
                  title="Sort clusters"
                >
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Sort: {sortBy === "status" ? "Status" : sortBy === "name" ? "Name" : sortBy === "recent" ? "Recent" : "Source"}</span>
                </button>
              )}
            >
              {({ close }) => (
                <>
                  <MenuLabel>Sort clusters</MenuLabel>
                  {(
                    [
                      ["status", "Open / status first"],
                      ["name", "Name A–Z"],
                      ["recent", "Recently opened"],
                      ["source", "Kubeconfig source"],
                    ] as const
                  ).map(([value, label]) => (
                    <MenuItem
                      key={value}
                      onClick={() => {
                        void updateSettings({ catalogSort: value });
                        close();
                      }}
                      icon={<ArrowUpDown className="h-3 w-3" />}
                      shortcut={sortBy === value ? "✓" : undefined}
                    >
                      {label}
                    </MenuItem>
                  ))}
                </>
              )}
            </Menu>
            <div className="w-64">
              <SearchInput
                ref={searchRef}
                value={search}
                onChange={setSearch}
                placeholder="Search clusters…"
                shortcut={isMac ? "⌘F" : "Ctrl F"}
              />
            </div>
            <button
              type="button"
              className="shell-icon-button"
              title="Refresh catalog"
              onClick={() => void loadCatalog()}
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </button>
            <button
              type="button"
              className="shell-icon-button"
              title="Settings"
              onClick={() => openSettings(true)}
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>

        {catalogError ? (
          <div className="m-6 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
            {catalogError}
          </div>
        ) : null}

        {selectedIds.size > 0 ? (
          <div className="mx-4 mt-3 flex h-9 items-center gap-2 rounded-lg border border-skyhook-500/30 bg-skyhook-500/10 px-3 text-[calc(11px*var(--font-scale))]">
            <span className="font-medium text-accent-text">{selectedIds.size} selected</span>
            <button
              type="button"
              className="rounded px-1.5 py-0.5 text-theme-text-secondary hover:bg-theme-hover"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </button>
            <button
              type="button"
              className="rounded px-1.5 py-0.5 text-theme-text-secondary hover:bg-theme-hover"
              onClick={() => {
                void updateSettings({
                  favorites: [...new Set([...favorites, ...selectedIds])],
                });
                toast.success("Added to favorites");
                setSelectedIds(new Set());
              }}
            >
              Add to favorites
            </button>
            <div className="ml-auto flex items-center gap-1.5">
              {view === "removed" ? (
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => {
                    void setHiddenClusters(hiddenIds.filter((id) => !selectedIds.has(id))).then(() => {
                      toast.success("Restored to catalog");
                      setSelectedIds(new Set());
                    });
                  }}
                >
                  Restore
                </Button>
              ) : (
                <Button size="xs" variant="danger" onClick={() => setConfirmRemove(true)}>
                  <Trash2 className="h-3 w-3" />
                  Remove from catalog
                </Button>
              )}
            </div>
          </div>
        ) : null}

        {clusters.length === 0 && !loading && view !== "removed" ? (
          <EmptyState
            icon={<Server />}
            title={allClusters.length > 0 ? "All clusters are removed from the catalog" : "No Kubernetes contexts found"}
            description={
              allClusters.length > 0
                ? "Your kubeconfig files are untouched. Open the Removed view to restore clusters."
                : "mLens reads kubeconfig files from ~/.kube/config and the KUBECONFIG environment variable. Import a file or paste a kubeconfig to get started — kubectl and Node.js are not required."
            }
            action={
              <div className="flex gap-2">
                {allClusters.length > 0 ? (
                  <Button variant="primary" onClick={() => setView("removed")}>
                    Open Removed view
                  </Button>
                ) : (
                  <>
                    <Button variant="primary" onClick={() => void importViaDialog()}>
                      <Upload className="h-3.5 w-3.5" />
                      Import kubeconfig
                    </Button>
                    <Button variant="secondary" onClick={() => setPasteOpen(true)}>
                      Paste kubeconfig
                    </Button>
                  </>
                )}
              </div>
            }
          />
        ) : (
          <div className="px-4 py-3">
            <div className="overflow-hidden rounded-lg border border-theme-border bg-theme-surface">
              <div className="grid grid-cols-[minmax(220px,1.4fr)_110px_90px_minmax(160px,1fr)_150px_130px_88px] items-center gap-2 border-b border-theme-border bg-theme-base px-3 py-2 text-[calc(10px*var(--font-scale))] font-medium uppercase tracking-wide text-theme-text-tertiary">
                <span>Cluster</span>
                <span>Status</span>
                <span>Version</span>
                <span>Kubeconfig</span>
                <span>Namespace</span>
                <span>Last opened</span>
                <span className="text-right">Actions</span>
              </div>
              {filtered.map((cluster) => {
                const status = statusOf(cluster);
                const session = sessions[cluster.id];
                const isFavorite = favorites.includes(cluster.id);
                const recent = settings?.recentClusters.find((entry) => entry.id === cluster.id);
                const connected = session?.status === "connected";
                return (
                  <div
                    key={cluster.id}
                    className="group grid cursor-pointer grid-cols-[minmax(220px,1.4fr)_110px_90px_minmax(160px,1fr)_150px_130px_88px] items-center gap-2 border-b-subtle px-3 py-2 last:border-0 hover:bg-theme-hover/40"
                    onClick={() => {
                      if (!hiddenSet.has(cluster.id)) void openCluster(cluster.id);
                    }}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(cluster.id)}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() =>
                          setSelectedIds((current) => {
                            const next = new Set(current);
                            if (next.has(cluster.id)) next.delete(cluster.id);
                            else next.add(cluster.id);
                            return next;
                          })
                        }
                        className="h-3.5 w-3.5 shrink-0 rounded border-theme-border accent-skyhook-500"
                      />
                      <div
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[calc(10px*var(--font-scale))] font-semibold text-white"
                        style={{
                          background: resolveClusterColor(
                            cluster.id,
                            cluster.name,
                            settings?.clusterColors,
                            settings?.clusterColorRules,
                            cluster.context,
                          ),
                        }}
                      >
                        {clusterShortName(cluster.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 truncate text-[calc(13px*var(--font-scale))] font-medium text-theme-text-primary">
                          {cluster.name}
                          {cluster.isCurrentContext ? (
                            <span className="badge-sm status-neutral">current</span>
                          ) : null}
                        </div>
                        <div className="truncate font-mono text-[calc(10px*var(--font-scale))] text-theme-text-tertiary" title={cluster.server}>
                          {cluster.server || cluster.context}
                        </div>
                      </div>
                      {cluster.error ? (
                        <span className="badge-sm status-unhealthy">invalid</span>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          status.tone === "connected"
                            ? "bg-emerald-500"
                            : status.tone === "error"
                              ? "bg-red-500"
                              : status.tone === "connecting"
                                ? "animate-pulse bg-amber-500"
                                : "bg-theme-text-disabled",
                        )}
                      />
                      <span className="truncate text-[calc(11px*var(--font-scale))] text-theme-text-secondary">{status.text}</span>
                    </div>

                    <span className="font-mono text-[calc(11px*var(--font-scale))] text-theme-text-tertiary">
                      {session?.info?.version ? `v${session.info.version}` : "—"}
                    </span>

                    <span className="truncate text-[calc(11px*var(--font-scale))] text-theme-text-secondary" title={cluster.kubeconfigPath}>
                      {basename(cluster.kubeconfigPath)}
                    </span>

                    <span className="truncate font-mono text-[calc(11px*var(--font-scale))] text-theme-text-tertiary">
                      {cluster.defaultNamespace}
                    </span>

                    <span className="text-[calc(11px*var(--font-scale))] text-theme-text-tertiary">
                      {recent ? formatRelativeTime(new Date(recent.openedAt).toISOString()) : "—"}
                    </span>

                    <div className="flex items-center justify-end gap-0.5" onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                        className={cn(
                          "rounded p-1 text-theme-text-tertiary opacity-0 transition-opacity hover:bg-theme-hover hover:text-amber-500 group-hover:opacity-100",
                          isFavorite && "text-amber-500 opacity-100",
                        )}
                        onClick={() => toggleFavorite(cluster.id)}
                      >
                        <Star className={cn("h-3.5 w-3.5", isFavorite && "fill-current")} />
                      </button>
                      <Menu
                        width={220}
                        align="end"
                        trigger={({ toggle }) => (
                          <button
                            type="button"
                            className="rounded p-1 text-theme-text-tertiary opacity-0 hover:bg-theme-hover hover:text-theme-text-primary group-hover:opacity-100"
                            onClick={toggle}
                            title="Cluster actions"
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        )}
                      >
                        {({ close }) => (
                          <>
                            <MenuLabel>{cluster.name}</MenuLabel>
                            {hiddenSet.has(cluster.id) ? (
                              <MenuItem
                                icon={<RefreshCw className="h-3.5 w-3.5" />}
                                onClick={() => {
                                  void setHiddenClusters(hiddenIds.filter((id) => id !== cluster.id)).then(() => {
                                    toast.success("Restored to catalog");
                                    close();
                                  });
                                }}
                              >
                                Restore to catalog
                              </MenuItem>
                            ) : (
                              <MenuItem
                                icon={<Server className="h-3.5 w-3.5" />}
                                onClick={() => {
                                  void openCluster(cluster.id);
                                  close();
                                }}
                              >
                                {connected ? "Open cluster" : "Connect and open"}
                              </MenuItem>
                            )}
                            <MenuItem
                              icon={<Copy className="h-3.5 w-3.5" />}
                              onClick={() => {
                                void navigator.clipboard.writeText(cluster.context);
                                toast.success("Context copied");
                                close();
                              }}
                            >
                              Copy context
                            </MenuItem>
                            <MenuSeparator />
                            {connected ? (
                              <MenuItem
                                icon={<LogOut className="h-3.5 w-3.5" />}
                                danger
                                onClick={() => {
                                  void disconnectCluster(cluster.id);
                                  close();
                                }}
                              >
                                Disconnect
                              </MenuItem>
                            ) : null}
                            <MenuItem
                              icon={<Trash2 className="h-3.5 w-3.5" />}
                              danger
                              onClick={() => {
                                void removeKubeconfig(cluster.kubeconfigPath);
                                close();
                              }}
                            >
                              Remove kubeconfig source
                            </MenuItem>
                          </>
                        )}
                      </Menu>
                      {loading ? <Spinner className="ml-1" /> : null}
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && clusters.length > 0 ? (
                <div className="px-3 py-10 text-center text-xs text-theme-text-tertiary">
                  No clusters match this view.
                </div>
              ) : null}
            </div>
            <p className="mt-3 text-[calc(10px*var(--font-scale))] leading-relaxed text-theme-text-disabled">
              mLens {info?.version ?? "0.1.0"} · design system inspired by Skyhook Radar (Apache-2.0) · shell
              structure inspired by Freelens (MIT). Contexts are read directly from kubeconfig; credentials never
              leave this machine.
            </p>
          </div>
        )}
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md text-theme-text-tertiary transition-colors hover:bg-theme-hover hover:text-theme-text-primary"
            title="Expand catalog (⌘B)"
            aria-label="Expand catalog"
            onClick={() => void updateSettings({ sidebarCollapsed: false })}
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
      </div>

      <ConfirmActionDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={() => {
          void setHiddenClusters([...hiddenIds, ...selectedIds]).then(() => {
            toast.success(`${selectedIds.size} cluster${selectedIds.size === 1 ? "" : "s"} removed from catalog`);
            setSelectedIds(new Set());
            setConfirmRemove(false);
          });
        }}
        title={`Remove ${selectedIds.size} cluster${selectedIds.size === 1 ? "" : "s"} from catalog?`}
        confirmLabel="Remove from catalog"
        danger
        description={
          <>
            <p>
              Removed clusters disappear from the hotbar, tabs and command palette. Their kubeconfig
              files are <span className="font-medium text-theme-text-primary">not modified</span>; you
              can restore them from the Removed view.
            </p>
            <ul className="mt-2 max-h-40 overflow-y-auto rounded border border-theme-border bg-theme-base p-2 font-mono text-[calc(11px*var(--font-scale))]">
              {allClusters
                .filter((cluster) => selectedIds.has(cluster.id))
                .map((cluster) => (
                  <li key={cluster.id} className="truncate">
                    {cluster.name}
                  </li>
                ))}
            </ul>
          </>
        }
      />

      <Modal
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        width={760}
        title="Paste a kubeconfig"
        subtitle="The content is validated, written with 0600 permissions under the mLens data directory, and added to the catalog."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPasteOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!pasteYaml.trim() || busy} onClick={() => void paste()}>
              {busy ? "Importing…" : "Import kubeconfig"}
            </Button>
          </>
        }
      >
        <label className="text-[calc(11px*var(--font-scale))] font-medium text-theme-text-secondary" htmlFor="paste-name">
          File name
        </label>
        <input
          id="paste-name"
          value={pasteName}
          onChange={(event) => setPasteName(event.target.value)}
          className="mt-1 mb-3 h-8 w-full rounded-md border border-theme-border bg-theme-elevated px-2 font-mono text-xs text-theme-text-primary focus:outline-none focus:ring-2 focus:ring-skyhook-500/60"
        />
        <label className="text-[calc(11px*var(--font-scale))] font-medium text-theme-text-secondary" htmlFor="paste-yaml">
          Kubeconfig YAML
        </label>
        <textarea
          id="paste-yaml"
          value={pasteYaml}
          onChange={(event) => setPasteYaml(event.target.value)}
          placeholder={"apiVersion: v1\nkind: Config\nclusters:\n  - cluster: ..."}
          spellCheck={false}
          className="mt-1 h-64 w-full resize-none rounded-md border border-theme-border bg-theme-base p-2 font-mono text-[calc(11px*var(--font-scale))] leading-relaxed text-theme-text-primary placeholder:text-theme-text-disabled focus:outline-none focus:ring-2 focus:ring-skyhook-500/60"
        />
      </Modal>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "success" }) {
  return (
    <div className="min-w-12">
      <div className={cn("text-[calc(15px*var(--font-scale))] font-semibold", tone === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-theme-text-primary")}>
        {value}
      </div>
      <div className="text-[calc(9px*var(--font-scale))] uppercase tracking-wide text-theme-text-tertiary">{label}</div>
    </div>
  );
}

function NavRow({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[calc(12px*var(--font-scale))] transition-colors",
        active
          ? "selection-strong selection-text"
          : "text-theme-text-secondary hover:bg-theme-hover/70 hover:text-theme-text-primary",
      )}
    >
      <span className="flex h-4 w-4 items-center justify-center [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined ? (
        <span className="rounded bg-theme-elevated px-1 font-mono text-[calc(9px*var(--font-scale))] text-theme-text-tertiary">{count}</span>
      ) : null}
    </button>
  );
}
