import { useEffect, useMemo, useRef, useState } from "react";
import {
  CircleCheck,
  Copy,
  FileCode,
  ListFilter,
  ListChecks,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Scale,
  TriangleExclamationPoint,
  ScrollText,
  SquareTerminal,
  Trash2,
  X,
} from "lucide-react";
import type { KubeObject } from "@shared/types";
import { useCatalogStore } from "../../stores/catalog-store";
import { useSessionStore, type DetailTab, type KindState } from "../../stores/session-store";
import { findResource } from "../../lib/catalog";
import { resourceStatus } from "../../lib/status";
import { getColumnsForKind, sortObjects, type ColumnDef } from "../../lib/columns";
import { getKindIcon, kindLabel } from "../../lib/icons";
import { cn } from "../../lib/cn";
import { Button } from "../../design-system/components/Button";
import { SearchInput } from "../../design-system/components/SearchInput";
import { EmptyState, InlineError } from "../../design-system/components/EmptyState";
import { MenuItem, MenuLabel, MenuSeparator } from "../../design-system/components/Menu";
import { ContextMenu } from "../../design-system/components/ContextMenu";
import { toast } from "../../design-system/components/Toast";
import { api, call, errorText } from "../../lib/api";
import { useResourceList } from "./useResourceList";
import { useResourceMetrics } from "./useResourceMetrics";
import { ResourceTable } from "./ResourceTable";
import { NamespacePicker, ColumnPicker } from "./TableControls";
import { buildFilterOptions, FilterPopover } from "./FilterPopover";
import { ConfirmActionDialog, CreateResourceDialog, ScaleDialog } from "./ResourceDialogs";

interface DialogState {
  type: "create" | "scale" | "delete" | "restart" | "bulk-delete";
  object?: KubeObject;
}

function rowKey(object: KubeObject): string {
  return object.metadata?.uid ?? `${object.metadata?.namespace}/${object.metadata?.name}`;
}

export function ResourceBrowser({ clusterId, active }: { clusterId: string; active: boolean }) {
  const session = useSessionStore((state) => state.sessions[clusterId]);
  const settings = useCatalogStore((state) => state.settings);
  const updateSettings = useCatalogStore((state) => state.updateSettings);
  const updateKindState = useSessionStore((state) => state.updateKindState);
  const setSelectedNamespaces = useSessionStore((state) => state.setSelectedNamespaces);
  const openDetails = useSessionStore((state) => state.openDetails);
  const setDetailsTab = useSessionStore((state) => state.setDetailsTab);
  const openTerminal = useSessionStore((state) => state.openTerminal);
  const details = session?.details;

  const resource = useMemo(
    () => findResource(session?.resources ?? [], session?.selectedKind ?? null),
    [session?.resources, session?.selectedKind],
  );

  const selectedNamespaces = session?.selectedNamespaces ?? [];
  const refreshSeconds = active ? (settings?.refreshIntervalSeconds ?? 30) : 0;
  const list = useResourceList({ clusterId, resource, namespaces: selectedNamespaces, refreshSeconds });

  const kindState: KindState = session && resource
    ? (session.kindStates[`${resource.apiVersion}|${resource.kind}`] ?? {
        search: "",
        regex: false,
        sort: null,
        filters: {},
        hiddenColumns: [],
        columnWidths: {},
      })
    : { search: "", regex: false, sort: null, filters: {}, hiddenColumns: [], columnWidths: {} };

  const showNamespace = Boolean(resource?.namespaced && selectedNamespaces.length !== 1);
  const baseColumns = useMemo(
    () => (resource ? getColumnsForKind(resource, showNamespace) : []),
    [resource, showNamespace],
  );
  const columnOrderKey = resource ? `${resource.apiVersion}|${resource.kind}` : "";
  const preferredOrder = settings?.tableColumnOrder?.[columnOrderKey] ?? [];
  const columns = useMemo(() => {
    const originalIndex = new Map(baseColumns.map((column, index) => [column.key, index]));
    return [...baseColumns].sort((a, b) => {
      const ai = preferredOrder.indexOf(a.key);
      const bi = preferredOrder.indexOf(b.key);
      if (ai === -1 && bi === -1) return (originalIndex.get(a.key) ?? 0) - (originalIndex.get(b.key) ?? 0);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseColumns, preferredOrder.join("|")]);

  const columnWidths = useMemo(() => {
    const result: Record<string, number> = {};
    for (const column of baseColumns) {
      const value = settings?.tableColumnWidths?.[`${resource?.kind}|${column.key}`];
      if (typeof value === "number") result[column.key] = value;
    }
    return result;
  }, [baseColumns, settings?.tableColumnWidths, resource?.kind]);
  // Columns marked `defaultHidden` (Pod IP, QoS, images, …) start hidden for
  // each kind. Persist that initial choice through the kind state so the
  // column picker and the user's later toggles agree.
  const kindStateKey = resource ? `${resource.apiVersion}|${resource.kind}` : null;
  useEffect(() => {
    if (!resource || !kindStateKey) return;
    if (session.kindStates[kindStateKey]) return;
    const defaults = columns.filter((column) => column.defaultHidden).map((column) => column.key);
    if (defaults.length === 0) return;
    updateKindState(clusterId, resource.apiVersion, resource.kind, { hiddenColumns: defaults });
  }, [kindStateKey, resource, columns, session.kindStates, clusterId, updateKindState]);

  const hidden = useMemo(() => new Set(kindState.hiddenColumns), [kindState.hiddenColumns]);
  const visible = useMemo(() => columns.filter((column) => !hidden.has(column.key)), [columns, hidden]);
  const metrics = useResourceMetrics({
    clusterId,
    resource,
    resources: session?.resources ?? [],
    namespaces: selectedNamespaces,
    refreshSeconds,
    active: active && visible.some((column) => column.key === "cpu" || column.key === "memory"),
  });

  const filterData = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildFilterOptions>>();
    for (const column of columns) {
      if (!column.filterValue) continue;
      // Namespace has a dedicated scope picker, so it must not open a second
      // namespace menu from the column header.
      if (column.key === "namespace") continue;
      const options = buildFilterOptions(list.items, column);
      if (options.length >= 2 && options.length <= 60) map.set(column.key, options);
    }
    return map;
  }, [columns, list.items]);

  const searchError = useMemo(() => {
    if (!kindState.search || !kindState.regex) return false;
    try {
      new RegExp(kindState.search);
      return false;
    } catch {
      return true;
    }
  }, [kindState.search, kindState.regex]);


  const [problemsOnly, setProblemsOnly] = useState(false);

  const problemCount = useMemo(
    () =>
      resource
        ? list.items.filter((object) => {
            const tone = resourceStatus(object, resource.kind).tone;
            return tone === "warning" || tone === "error";
          }).length
        : 0,
    [list.items, resource],
  );

  const filtered = useMemo(() => {
    let rows = list.items;
    const term = kindState.search.trim();
    if (term) {
      let regex: RegExp | null = null;
      if (kindState.regex) {
        try {
          regex = new RegExp(term, "i");
        } catch {
          regex = null;
        }
      }
      const needle = term.toLowerCase();
      rows = rows.filter((row) => {
        const haystack = [
          row.metadata?.name,
          row.metadata?.namespace,
          ...columns.map((column) => column.value?.(row)),
          ...Object.keys(row.metadata?.labels ?? {}),
        ]
          .filter((value) => value !== undefined && value !== null)
          .join(" ");
        return regex ? regex.test(haystack) : haystack.toLowerCase().includes(needle);
      });
    }

    if (problemsOnly && resource) {
      rows = rows.filter((object) => {
        const tone = resourceStatus(object, resource.kind).tone;
        return tone === "warning" || tone === "error";
      });
    }

    const activeFilters = Object.entries(kindState.filters).filter(([, values]) => values.length > 0);
    if (activeFilters.length > 0) {
      rows = rows.filter((row) =>
        activeFilters.every(([key, values]) => {
          const column = columns.find((entry) => entry.key === key);
          const value = column?.filterValue?.(row);
          return value !== undefined && values.includes(value);
        }),
      );
    }
    return rows;
  }, [list.items, kindState.search, kindState.regex, kindState.filters, columns, problemsOnly, resource]);

  const sorted = useMemo(() => {
    const sortColumn = kindState.sort ? columns.find((column) => column.key === kindState.sort?.key) : undefined;
    if (sortColumn) return sortObjects(filtered, sortColumn, kindState.sort!.direction);
    return sortObjects(filtered, columns.find((column) => column.key === "name"), "asc");
  }, [filtered, kindState.sort, columns]);

  const [filterPanel, setFilterPanel] = useState<{ key: string; x: number; y: number } | null>(null);
  const [menu, setMenu] = useState<{ object: KubeObject; x: number; y: number } | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    // Filters may reference columns hidden by a kind switch.
    if (filterPanel && !filterData.has(filterPanel.key)) setFilterPanel(null);
  }, [filterPanel, filterData]);

  useEffect(() => {
    setSelectedKeys(new Set());
    setProblemsOnly(false);
  }, [kindStateKey, selectedNamespaces.join(",")]);

  if (!session) return null;

  const setKindPatch = (patch: Partial<typeof kindState>) => {
    if (!resource) return;
    updateKindState(clusterId, resource.apiVersion, resource.kind, patch);
  };

  const onSort = (key: string) => {
    const current = kindState.sort;
    if (current?.key !== key) setKindPatch({ sort: { key, direction: "asc" } });
    else if (current.direction === "asc") setKindPatch({ sort: { key, direction: "desc" } });
    else setKindPatch({ sort: null });
  };

  const clearFilters = () => setKindPatch({ filters: {}, search: "" });

  const activeFilterChips = Object.entries(kindState.filters)
    .filter(([, values]) => values.length > 0)
    .map(([key, values]) => ({
      key,
      label: columns.find((column) => column.key === key)?.label ?? key,
      values,
    }));

  const openFilter = (column: ColumnDef, event: React.MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setFilterPanel({ key: column.key, x: rect.left, y: rect.bottom + 4 });
  };

  const openTab = (object: KubeObject, tab?: DetailTab) => {
    if (!resource) return;
    openDetails(clusterId, {
      clusterId,
      apiVersion: resource.apiVersion,
      kind: resource.kind,
      namespace: object.metadata?.namespace,
      name: object.metadata?.name,
    });
    if (tab) setDetailsTab(clusterId, tab);
  };

  const selectedRef = details?.ref ?? null;

  const openExec = async (object: KubeObject) => {
    if (!resource) return;
    const podNamespace = object.metadata?.namespace;
    const podName = object.metadata?.name;
    if (!podNamespace || !podName) return;
    try {
      const containers = await call(api.pods.containers(clusterId, podNamespace, podName));
      const container = containers[0]?.name;
      if (!container) throw new Error("Pod has no containers");
      openTerminal(clusterId, {
        type: "pod",
        clusterId,
        namespace: podNamespace,
        pod: podName,
        container,
        shell: "/bin/sh",
      });
    } catch (error) {
      toast.error("Cannot open pod shell", errorText(error));
    }
  };

  const toggleRowSelection = (object: KubeObject) => {
    const key = rowKey(object);
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllSelection = () => {
    setSelectedKeys((current) => {
      const visibleKeys = sorted.map(rowKey);
      const allSelected = visibleKeys.every((key) => current.has(key));
      if (allSelected) {
        const next = new Set(current);
        for (const key of visibleKeys) next.delete(key);
        return next;
      }
      return new Set([...current, ...visibleKeys]);
    });
  };

  const selectedObjects = list.items.filter((object) => selectedKeys.has(rowKey(object)));

  const deleteSelected = async () => {
    if (!resource || selectedObjects.length === 0) return;
    setBusy(true);
    let deleted = 0;
    const failures: string[] = [];
    for (const object of selectedObjects) {
      try {
        await call(
          api.resources.delete({
            clusterId,
            apiVersion: resource.apiVersion,
            kind: resource.kind,
            namespace: object.metadata?.namespace,
            name: object.metadata?.name,
            propagationPolicy: "Background",
          }),
        );
        deleted += 1;
      } catch (deleteError) {
        failures.push(`${object.metadata?.name}: ${errorText(deleteError)}`);
      }
    }
    setBusy(false);
    setDialog(null);
    setSelectedKeys(new Set());
    await list.refresh(true);
    if (failures.length === 0) {
      toast.success(`${deleted} ${resource.kind}${deleted === 1 ? "" : "s"} deleted`);
    } else {
      toast.error(
        `Deleted ${deleted}, failed ${failures.length}`,
        failures.slice(0, 4).join("\n"),
      );
    }
  };

  const deleteObject = async () => {
    if (!resource || !dialog?.object) return;
    setBusy(true);
    try {
      await call(
        api.resources.delete({
          clusterId,
          apiVersion: resource.apiVersion,
          kind: resource.kind,
          namespace: dialog.object.metadata?.namespace,
          name: dialog.object.metadata?.name,
          propagationPolicy: "Background",
        }),
      );
      toast.success("Resource deleted", `${resource.kind}/${dialog.object.metadata?.name}`);
      setDialog(null);
      await list.refresh(true);
    } catch (error) {
      toast.error("Delete failed", errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const restartObject = async () => {
    if (!resource || !dialog?.object) return;
    setBusy(true);
    try {
      await call(
        api.resources.restart({
          clusterId,
          apiVersion: resource.apiVersion,
          kind: resource.kind,
          namespace: dialog.object.metadata?.namespace ?? "",
          name: dialog.object.metadata?.name,
        }),
      );
      toast.success("Rollout restarted", dialog.object.metadata?.name);
      setDialog(null);
      await list.refresh(true);
    } catch (error) {
      toast.error("Restart failed", errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const scaleObject = async (replicas: number) => {
    if (!resource || !dialog?.object) return;
    setBusy(true);
    try {
      await call(
        api.resources.scale({
          clusterId,
          apiVersion: resource.apiVersion,
          kind: resource.kind,
          namespace: dialog.object.metadata?.namespace ?? "",
          name: dialog.object.metadata?.name,
          replicas,
        }),
      );
      toast.success("Scaled", `${dialog.object.metadata?.name} → ${replicas} replicas`);
      setDialog(null);
      await list.refresh(true);
    } catch (error) {
      toast.error("Scale failed", errorText(error));
    } finally {
      setBusy(false);
    }
  };

  if (!resource) {
    return (
      <div className="flex flex-1 flex-col">
        <EmptyState
          icon={<FileCode />}
          title="Select a resource kind"
          description="Pick a Kubernetes resource from the catalog on the left, or expand a CRD group."
        />
      </div>
    );
  }

  const Icon = getKindIcon(resource.kind, resource.group);
  const lowerKind = resource.kind.toLowerCase();
  const canScale = ["deployment", "statefulset", "replicaset"].includes(lowerKind);
  const canRestart = ["deployment", "statefulset", "daemonset"].includes(lowerKind);
  const canSuspend = ["job", "cronjob"].includes(lowerKind);
  const isPod = lowerKind === "pod";

  const toggleSuspend = async (object: KubeObject) => {
    if (!resource) return;
    const suspended = Boolean(object.spec?.suspend);
    try {
      await call(
        api.resources.patch({
          clusterId,
          apiVersion: resource.apiVersion,
          kind: resource.kind,
          namespace: object.metadata?.namespace,
          name: object.metadata?.name,
          patch: { spec: { suspend: !suspended } },
        }),
      );
      toast.success(suspended ? "Resource resumed" : "Resource suspended", object.metadata?.name);
      await list.refresh(true);
    } catch (error) {
      toast.error(suspended ? "Resume failed" : "Suspend failed", errorText(error));
    }
  };
  const contextObject = menu?.object;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-theme-surface">
      <div className="flex h-12 min-w-0 shrink-0 items-center gap-2 overflow-hidden border-b border-theme-border bg-theme-base px-3">
        <Icon className="h-4 w-4 shrink-0 text-accent-text" />
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="truncate text-[14px] font-semibold text-theme-text-primary">
            {kindLabel(resource.kind, resource.plural)}
          </h1>
          <span className="font-mono text-[11px] text-theme-text-tertiary tabular-nums">
            {filtered.length !== list.items.length ? `${filtered.length} / ` : ""}
            {list.total ?? list.items.length}
          </span>
        </div>
        <Freshness
          loading={list.loading}
          watchState={list.watchState}
          lastUpdated={list.lastUpdated}
          refreshSeconds={refreshSeconds}
        />

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {resource.namespaced ? (
            <NamespacePicker
              namespaces={session.namespaces}
              value={selectedNamespaces}
              onChange={(next) => setSelectedNamespaces(clusterId, next)}
              showSystemNamespaces={settings?.showSystemNamespaces ?? false}
              onShowSystemNamespacesChange={(show) => void updateSettings({ showSystemNamespaces: show })}
            />
          ) : null}

          <div className="w-56 min-w-40 shrink">
            <SearchInput
              ref={searchRef}
              value={kindState.search}
              onChange={(search) => setKindPatch({ search })}
              regex={kindState.regex}
              onRegexChange={(regex) => setKindPatch({ regex })}
              regexError={searchError}
              placeholder={`Search ${kindLabel(resource.kind, resource.plural).toLowerCase()}…`}
              size="md"
            />
          </div>

          {[...filterData.keys()].slice(0, 3).map((key) => {
            const column = columns.find((entry) => entry.key === key);
            if (!column) return null;
            const count = kindState.filters[key]?.length ?? 0;
            return (
              <button
                key={key}
                type="button"
                onClick={(event) => openFilter(column, event)}
                className={cn(
                  "hidden h-8 items-center gap-1 rounded-lg border px-2 text-[11px] transition-colors lg:flex",
                  count > 0
                    ? "border-skyhook-500/40 bg-skyhook-500/10 text-accent-text"
                    : "border-theme-border bg-theme-surface text-theme-text-secondary hover:bg-theme-hover",
                )}
                title={`Filter by ${column.label}`}
              >
                <ListFilter className="h-3 w-3" />
                <span className="hidden xl:inline">{column.label}</span>
                {count > 0 ? <span className="font-mono">{count}</span> : null}
              </button>
            );
          })}

          <ColumnPicker
            columns={columns}
            hidden={hidden}
            onChange={(next) => setKindPatch({ hiddenColumns: next })}
            onMove={(key, direction) => {
              if (!resource) return;
              const keys = columns.map((column) => column.key);
              const index = keys.indexOf(key);
              const target = direction === "up" ? index - 1 : index + 1;
              if (index < 0 || target < 0 || target >= keys.length) return;
              [keys[index], keys[target]] = [keys[target], keys[index]];
              void updateSettings({
                tableColumnOrder: {
                  ...(settings?.tableColumnOrder ?? {}),
                  [columnOrderKey]: keys,
                },
              });
            }}
          />

          <button
            type="button"
            onClick={() => setProblemsOnly((value) => !value)}
            className={cn(
              "flex h-8 items-center gap-1 rounded-lg border px-2 text-[11px] transition-colors",
              problemsOnly
                ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "border-theme-border bg-theme-surface text-theme-text-secondary hover:bg-theme-hover",
            )}
            title="Show only resources with warning/error status"
          >
            <TriangleExclamationPoint className="h-3 w-3" />
            <span className="hidden xl:inline">Problems</span>
            {problemCount > 0 ? <span className="font-mono">{problemCount}</span> : null}
          </button>

          <button
            type="button"
            onClick={toggleAllSelection}
            className={cn("shell-icon-button", selectedKeys.size > 0 && "is-active")}
            title="Select all visible resources"
          >
            <ListChecks className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => void list.refresh(false)}
            className="shell-icon-button"
            title="Refresh now"
            disabled={list.loading}
          >
            <RefreshCw className={cn("h-4 w-4", list.loading && "animate-spin")} />
          </button>

          <Button variant="primary" size="sm" onClick={() => setDialog({ type: "create" })}>
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">Create</span>
            <span className="xl:hidden">YAML</span>
          </Button>
        </div>
      </div>

      {problemsOnly ? (
        <div className="flex h-7 shrink-0 items-center gap-2 border-b border-theme-border bg-amber-500/5 px-3 text-[11px] text-amber-700 dark:text-amber-300">
          <TriangleExclamationPoint className="h-3 w-3" />
          Showing {problemCount} resource{problemCount === 1 ? "" : "s"} with warning/error status
          <button type="button" className="ml-auto underline" onClick={() => setProblemsOnly(false)}>
            clear
          </button>
        </div>
      ) : null}

      {activeFilterChips.length > 0 ? (
        <div className="flex h-8 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-theme-border bg-theme-base/60 px-3">
          <span className="text-[10px] uppercase tracking-wide text-theme-text-tertiary">Filters</span>
          {activeFilterChips.map((chip) => (
            <span
              key={chip.key}
              className="flex items-center gap-1 rounded-md border border-skyhook-500/30 bg-skyhook-500/10 px-1.5 py-0.5 text-[11px] text-accent-text"
            >
              <span className="text-theme-text-tertiary">{chip.label}:</span>
              <span className="max-w-[16rem] truncate">{chip.values.join(", ")}</span>
              <button
                type="button"
                className="rounded p-0.5 hover:bg-skyhook-500/20"
                onClick={() => {
                  const next = { ...kindState.filters };
                  delete next[chip.key];
                  setKindPatch({ filters: next });
                }}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
          <button
            type="button"
            className="ml-auto shrink-0 text-[11px] text-theme-text-tertiary hover:text-theme-text-primary"
            onClick={clearFilters}
          >
            Clear all
          </button>
        </div>
      ) : null}

      {list.error ? (
        <div className="p-3">
          <InlineError
            title={`Cannot list ${resource.kind}`}
            message={list.error}
            action={
              <Button size="sm" variant="secondary" onClick={() => void list.refresh(false)}>
                Retry
              </Button>
            }
          />
        </div>
      ) : (
        <ResourceTable
          rows={sorted}
          columns={visible}
          showNamespace={showNamespace}
          sort={kindState.sort}
          onSort={onSort}
          selectedRef={selectedRef}
          onOpen={(object) => openTab(object)}
          onContextMenu={(object, event) => setMenu({ object, x: event.clientX, y: event.clientY })}
          onFilterColumn={openFilter}
          columnWidths={columnWidths}
          onResizeEnd={(key, width) => {
            if (!resource) return;
            void updateSettings({
              tableColumnWidths: {
                ...(settings?.tableColumnWidths ?? {}),
                [`${resource.kind}|${key}`]: width,
              },
            });
          }}
          onResetColumnWidth={(key) => {
            if (!resource) return;
            const next = { ...(settings?.tableColumnWidths ?? {}) };
            delete next[`${resource.kind}|${key}`];
            void updateSettings({ tableColumnWidths: next });
          }}
          filterableKeys={new Set(filterData.keys())}
          rowHeight={settings?.tableRowHeight ?? 44}
          podMetrics={metrics.pods}
          nodeMetrics={metrics.nodes}
          onSelectNamespace={(namespace) => setSelectedNamespaces(clusterId, [namespace])}
          selectionMode
          selectedKeys={selectedKeys}
          onToggleRow={toggleRowSelection}
          onToggleAll={toggleAllSelection}
          loading={list.loading}
          emptyState={
            <EmptyState
              icon={<CircleCheck />}
              title={kindState.search || activeFilterChips.length ? "No matching resources" : `No ${kindLabel(resource.kind, resource.plural)}`}
              description={
                kindState.search || activeFilterChips.length
                  ? "Adjust the search or clear the filters."
                  : "Nothing exists in this scope. Create one with YAML or switch namespaces."
              }
            />
          }
        />
      )}

      {selectedKeys.size > 0 ? (
        <div className="flex h-8 shrink-0 items-center gap-2 border-b border-theme-border bg-skyhook-500/10 px-3 text-[11px]">
          <span className="font-medium text-accent-text">{selectedKeys.size} selected</span>
          <button
            type="button"
            className="rounded px-1.5 py-0.5 text-theme-text-secondary hover:bg-theme-hover hover:text-theme-text-primary"
            onClick={toggleAllSelection}
          >
            {sorted.length > 0 && sorted.every((row) => selectedKeys.has(rowKey(row))) ? "Clear visible" : "Select visible"}
          </button>
          <button
            type="button"
            className="rounded px-1.5 py-0.5 text-theme-text-secondary hover:bg-theme-hover hover:text-theme-text-primary"
            onClick={() => setSelectedKeys(new Set())}
          >
            Clear
          </button>
          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="danger" size="xs" onClick={() => setDialog({ type: "bulk-delete" })}>
              <Trash2 className="h-3 w-3" />
              Delete selected
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex h-7 shrink-0 items-center gap-3 border-t border-theme-border bg-theme-base px-3 text-[10px] text-theme-text-tertiary">
        <span>{list.items.length} loaded</span>
        <span className="text-theme-text-disabled">·</span>
        <span className="font-mono">{resource.apiVersion}/{resource.kind}</span>
        <span className="text-theme-text-disabled">·</span>
        <span>{resource.isCrd ? "Custom resource" : "Built-in resource"}</span>
        {list.hasMore ? (
          <button
            type="button"
            className="ml-auto text-accent-text hover:underline"
            onClick={() => void list.loadMore()}
          >
            Load more
          </button>
        ) : (
          <span className="ml-auto">{filtered.length} visible</span>
        )}
      </div>

      {filterPanel ? (
        <FilterPopover
          x={filterPanel.x}
          y={filterPanel.y}
          column={columns.find((column) => column.key === filterPanel.key)!}
          options={filterData.get(filterPanel.key) ?? []}
          selected={kindState.filters[filterPanel.key] ?? []}
          onChange={(values) =>
            setKindPatch({ filters: { ...kindState.filters, [filterPanel.key]: values } })
          }
          onClose={() => setFilterPanel(null)}
        />
      ) : null}

      <ContextMenu
        open={Boolean(menu)}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        onClose={() => setMenu(null)}
        width={240}
      >
        <MenuLabel>{contextObject ? `${resource.kind}/${contextObject.metadata?.name}` : ""}</MenuLabel>
        <MenuItem
          icon={<ScrollText className="h-3.5 w-3.5" />}
          onClick={() => {
            if (contextObject) openTab(contextObject);
            setMenu(null);
          }}
        >
          Open details
        </MenuItem>
        <MenuItem
          icon={<FileCode className="h-3.5 w-3.5" />}
          onClick={() => {
            if (contextObject) openTab(contextObject, "yaml");
            setMenu(null);
          }}
        >
          View YAML
        </MenuItem>
        {isPod ? (
          <MenuItem
            icon={<ScrollText className="h-3.5 w-3.5" />}
            onClick={() => {
              if (contextObject) openTab(contextObject, "logs");
              setMenu(null);
            }}
          >
            Logs
          </MenuItem>
        ) : null}
        {isPod ? (
          <MenuItem
            icon={<SquareTerminal className="h-3.5 w-3.5" />}
            onClick={() => {
              if (contextObject) void openExec(contextObject);
              setMenu(null);
            }}
          >
            Exec into container
          </MenuItem>
        ) : null}
        {canScale ? (
          <MenuItem
            icon={<Scale className="h-3.5 w-3.5" />}
            onClick={() => {
              setDialog({ type: "scale", object: contextObject });
              setMenu(null);
            }}
          >
            Scale…
          </MenuItem>
        ) : null}
        {canRestart ? (
          <MenuItem
            icon={<Play className="h-3.5 w-3.5" />}
            onClick={() => {
              setDialog({ type: "restart", object: contextObject });
              setMenu(null);
            }}
          >
            Restart rollout…
          </MenuItem>
        ) : null}
        {canSuspend ? (
          <MenuItem
            icon={<Pause className="h-3.5 w-3.5" />}
            onClick={() => {
              if (contextObject) void toggleSuspend(contextObject);
              setMenu(null);
            }}
          >
            {contextObject?.spec?.suspend ? "Resume" : "Suspend"}
          </MenuItem>
        ) : null}
        <MenuSeparator />
        <MenuItem
          icon={<Copy className="h-3.5 w-3.5" />}
          onClick={() => {
            if (contextObject) {
              const namespaceFlag =
                contextObject.metadata?.namespace ? ` -n ${contextObject.metadata.namespace}` : "";
              void navigator.clipboard.writeText(
                `kubectl get ${resource.plural} ${contextObject.metadata?.name}${namespaceFlag} --context ${session.info?.context ?? ""}`,
              );
              toast.success("kubectl command copied");
            }
            setMenu(null);
          }}
        >
          Copy kubectl command
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          danger
          icon={<Trash2 className="h-3.5 w-3.5" />}
          onClick={() => {
            setDialog({ type: "delete", object: contextObject });
            setMenu(null);
          }}
        >
          Delete…
        </MenuItem>
      </ContextMenu>

      <CreateResourceDialog
        open={dialog?.type === "create"}
        onClose={() => setDialog(null)}
        clusterId={clusterId}
        resource={resource}
        namespace={selectedNamespaces.length === 1 ? selectedNamespaces[0] : "default"}
        onCreated={() => void list.refresh(true)}
      />

      <ScaleDialog
        open={dialog?.type === "scale"}
        onClose={() => setDialog(null)}
        onConfirm={(replicas) => void scaleObject(replicas)}
        current={Number(dialog?.object?.spec?.replicas ?? 0)}
        title={dialog?.object?.metadata?.name ?? ""}
        busy={busy}
      />

      <ConfirmActionDialog
        open={dialog?.type === "delete"}
        onClose={() => setDialog(null)}
        onConfirm={() => void deleteObject()}
        title={`Delete ${resource.kind}`}
        confirmLabel="Delete resource"
        danger
        busy={busy}
        description={
          <>
            <p>
              Delete <span className="font-medium text-theme-text-primary">{dialog?.object?.metadata?.name}</span>
              {dialog?.object?.metadata?.namespace ? ` in ${dialog.object.metadata.namespace}` : ""}?
            </p>
            <p className="mt-2 text-xs text-theme-text-tertiary">
              Dependents use the Background propagation policy. This action cannot be undone.
            </p>
          </>
        }
      />

      <ConfirmActionDialog
        open={dialog?.type === "bulk-delete"}
        onClose={() => setDialog(null)}
        onConfirm={() => void deleteSelected()}
        title={`Delete ${selectedObjects.length} ${resource.kind}${selectedObjects.length === 1 ? "" : "s"}`}
        confirmLabel="Delete selected"
        danger
        busy={busy}
        description={
          <>
            <p>
              Permanently delete <span className="font-medium text-theme-text-primary">{selectedObjects.length}</span>{" "}
              resource{selectedObjects.length === 1 ? "" : "s"}? This cannot be undone.
            </p>
            <ul className="mt-2 max-h-40 overflow-y-auto rounded border border-theme-border bg-theme-base p-2 font-mono text-[11px]">
              {selectedObjects.slice(0, 50).map((object) => (
                <li key={rowKey(object)} className="truncate">
                  {object.metadata?.namespace ? `${object.metadata.namespace}/` : ""}
                  {object.metadata?.name}
                </li>
              ))}
              {selectedObjects.length > 50 ? <li>…and {selectedObjects.length - 50} more</li> : null}
            </ul>
          </>
        }
      />

      <ConfirmActionDialog
        open={dialog?.type === "restart"}
        onClose={() => setDialog(null)}
        onConfirm={() => void restartObject()}
        title="Restart rollout"
        confirmLabel="Restart"
        busy={busy}
        description={
          <p>
            Patch <span className="inline-code">spec.template.metadata.annotations</span> on{" "}
            <span className="font-medium text-theme-text-primary">{dialog?.object?.metadata?.name}</span> to trigger a
            rolling restart.
          </p>
        }
      />
    </div>
  );
}

function Freshness({
  loading,
  watchState,
  lastUpdated,
  refreshSeconds,
}: {
  loading: boolean;
  watchState: "connecting" | "live" | "error" | "off";
  lastUpdated: number | null;
  refreshSeconds: number;
}) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const label = loading
    ? "Loading…"
    : watchState === "live" || watchState === "connecting"
      ? refreshSeconds
        ? `Live · polls ${refreshSeconds}s`
        : "Live"
      : watchState === "error"
        ? refreshSeconds
          ? `Polling ${refreshSeconds}s`
          : "Paused"
        : refreshSeconds
          ? `Auto ${refreshSeconds}s`
          : "Manual";

  const age = lastUpdated ? Math.max(0, Math.round((Date.now() - lastUpdated) / 1000)) : null;

  return (
    <div className="ml-2 hidden items-center gap-1.5 text-[10px] text-theme-text-tertiary sm:flex">
      {loading ? (
        <LoaderCircle className="h-3 w-3 animate-spin" />
      ) : watchState === "error" ? (
        <Pause className="h-2.5 w-2.5 text-amber-500" />
      ) : (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </span>
      )}
      <span>{label}</span>
      {age !== null ? <span className="tabular">· {age}s ago</span> : null}
    </div>
  );
}
