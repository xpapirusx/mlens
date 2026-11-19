import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeftRight,
  Ban,
  Box,
  CircleCheck,
  Copy,
  Diff,
  FileCode,
  ListFilter,
  ListChecks,
  LoaderCircle,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Scale,
  Server,
  Tags,
  TriangleExclamationPoint,
  ScrollText,
  SquareTerminal,
  Trash2,
  X,
} from "lucide-react";
import type { ApiResourceInfo, KubeObject, ResourceKey, TableSort } from "@shared/types";
import { useCatalogStore } from "../../stores/catalog-store";
import { useSessionStore, type DetailTab, type KindState, emptyKindState } from "../../stores/session-store";
import { findResource, HELM_RELEASES_RESOURCE } from "../../lib/catalog";
import { resourceStatus } from "../../lib/status";
import { getColumnsForKind, sortObjects, WARNING_KINDS, type CellContext, type ColumnDef } from "../../lib/columns";
import { getKindIcon, kindLabel } from "../../lib/icons";
import { cn } from "../../lib/cn";
import { Button } from "../../design-system/components/Button";
import { SearchInput } from "../../design-system/components/SearchInput";
import { EmptyState, InlineError } from "../../design-system/components/EmptyState";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "../../design-system/components/Menu";
import { ContextMenu } from "../../design-system/components/ContextMenu";
import { toast } from "../../design-system/components/Toast";
import { api, call, errorText } from "../../lib/api";
import { useDebouncedValue, useResourceList } from "./useResourceList";
import { useResourceMetrics } from "./useResourceMetrics";
import { ResourceTable } from "./ResourceTable";
import { NamespacePicker, ColumnPicker } from "./TableControls";
import { buildFilterOptions, FilterPopover } from "./FilterPopover";
import { ConfirmActionDialog, ScaleDialog } from "./ResourceDialogs";
import { SetImageDialog } from "../resource-details/SetImageDialog";
import { LabelsAnnotationsDialog } from "../resource-details/LabelsAnnotationsDialog";
import { PresetDialog } from "./PresetDialog";
import { CopyNamesDialog } from "./CopyNamesDialog";
import { ResourceDiffDialog } from "./ResourceDiffDialog";
import { BulkAnnotationsDialog } from "./BulkAnnotationsDialog";
import { NodeDrainDialog } from "../resource-details/NodeDrainDialog";
import { NodeDebugDialog } from "../resource-details/NodeDebugDialog";
import { ClusterOverview } from "../overview/ClusterOverview";
import { useClaimPods } from "./useClaimPods";
import { useServiceEndpoints } from "./useServiceEndpoints";
import { useWarningEvents } from "./useWarningEvents";
import { useNodePodCounts } from "./useNodePodCounts";
import { isDeploymentPaused, isSuspended, restartWorkload, scaleWorkload, setWorkloadPaused, setWorkloadSuspended, triggerCronJob, workloadCapabilities } from "../../lib/workload-actions";

interface DialogState {
  type:
    | "scale"
    | "delete"
    | "restart"
    | "bulk-delete"
    | "set-image"
    | "drain"
    | "debug"
    | "labels"
    | "bulk-apply"
    | "presets"
    | "copy-names"
    | "diff"
    | "bulk-annotate";
  object?: KubeObject;
  force?: boolean;
  /** bulk-apply: which metadata field and which preset to write. */
  applyField?: "labels" | "annotations";
  applyKey?: string;
  applyValue?: string;
  /** presets: which saved list to edit. */
  presetField?: "labels" | "annotations";
  /** diff: the exact pair to compare (same or different clusters). */
  diffLeft?: ResourceKey;
  diffRight?: ResourceKey;
}

function rowKey(object: KubeObject): string {
  return object.metadata?.uid ?? `${object.metadata?.namespace}/${object.metadata?.name}`;
}

// Stable fallbacks: selector results must keep their identity between store
// notifications (a fresh `[]` per call is the classic React #185 loop).
const EMPTY_RESOURCES: ApiResourceInfo[] = [];
const EMPTY_NAMESPACES: string[] = [];
const EMPTY_KIND_STATES: Record<string, KindState> = {};
const EMPTY_FILTER_OPTIONS: ReturnType<typeof buildFilterOptions> = [];

export function ResourceBrowser({
  clusterId,
  active,
  side,
  overlay,
}: {
  clusterId: string;
  active: boolean;
  /** Editor area; rendered beside the table, below the toolbar row. */
  side?: ReactNode;
  /** Absolutely positioned layer (minimized-editor pill) inside the row. */
  overlay?: ReactNode;
}) {
  // A14: field-level session selectors — a keystroke in search updates only
  // `kindStates`, not every subscriber of the whole session object.
  const hasSession = useSessionStore((state) => Boolean(state.sessions[clusterId]));
  const selectedRef = useSessionStore((state) => {
    const session = state.sessions[clusterId];
    const pane = session?.editor.panes.find((entry) => entry.id === session.editor.activePaneId);
    return pane?.active ?? null;
  });
  const resources = useSessionStore((state) => state.sessions[clusterId]?.resources) ?? EMPTY_RESOURCES;
  const selectedKind = useSessionStore((state) => state.sessions[clusterId]?.selectedKind) ?? null;
  const selectedNamespaces =
    useSessionStore((state) => state.sessions[clusterId]?.selectedNamespaces) ?? EMPTY_NAMESPACES;
  const kindStates = useSessionStore((state) => state.sessions[clusterId]?.kindStates) ?? EMPTY_KIND_STATES;
  const namespaces = useSessionStore((state) => state.sessions[clusterId]?.namespaces) ?? EMPTY_NAMESPACES;
  const sessionInfo = useSessionStore((state) => state.sessions[clusterId]?.info) ?? null;
  const settings = useCatalogStore((state) => state.settings);
  const updateSettings = useCatalogStore((state) => state.updateSettings);
  const allClusters = useCatalogStore((state) => state.allClusters);
  const compareSelection = useCatalogStore((state) => state.compareSelection);
  const setCompareSelection = useCatalogStore((state) => state.setCompareSelection);
  const updateKindState = useSessionStore((state) => state.updateKindState);
  const setSelectedNamespaces = useSessionStore((state) => state.setSelectedNamespaces);
  const openDetails = useSessionStore((state) => state.openDetails);
  const openYamlTab = useSessionStore((state) => state.openYamlTab);
  const closeDetails = useSessionStore((state) => state.closeDetails);
  const setDetailsTab = useSessionStore((state) => state.setDetailsTab);
  const openTerminal = useSessionStore((state) => state.openTerminal);

  const resource = useMemo(() => {
    const selected = selectedKind;
    const found = findResource(resources, selected);
    if (found) return found;
    // Helm releases are parsed from secrets, so discovery never lists them:
    // the synthetic resource stands in for the selected kind.
    if (selected?.kind === "HelmRelease" && selected.apiVersion === "helm.sh/v1") {
      return HELM_RELEASES_RESOURCE;
    }
    return undefined;
  }, [resources, selectedKind]);

  const refreshSeconds = active ? (settings?.refreshIntervalSeconds ?? 30) : 0;
  const list = useResourceList({ clusterId, resource, namespaces: selectedNamespaces, refreshSeconds });

  const kindState: KindState = hasSession && resource
    ? (kindStates[`${resource.apiVersion}|${resource.kind}`] ?? emptyKindState())
    : emptyKindState();

  // Keep the Namespace column even when a single namespace is selected.
  // Clicking a namespace cell scopes the list; flipping the column off at that
  // moment rebuilds `columns`, resets table highlight/layout and yanks the
  // column out from under the cursor. Filtering should remove rows, not
  // columns — the column picker can still hide it on purpose.
  const showNamespace = Boolean(resource?.namespaced);
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

  // Sort precedence: the choice made in this session, then the persisted sort
  // for this `<apiVersion>|<kind>`, then (for a first opening) newest first.
  // Any saved key that no longer exists for the kind is ignored.
  const hasSortColumn = (sort: TableSort | null | undefined): sort is TableSort =>
    Boolean(sort && columns.some((column) => column.key === sort.key));
  const savedSort = columnOrderKey ? settings?.tableSorts?.[columnOrderKey] : undefined;
  const defaultSort: TableSort = columns.some((column) => column.key === "age")
    ? { key: "age", direction: "desc" }
    : { key: "name", direction: "asc" };
  const effectiveSort: TableSort =
    (hasSortColumn(kindState.sort) ? kindState.sort : null) ??
    (hasSortColumn(savedSort) ? savedSort : null) ??
    defaultSort;

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
    if (kindStates[kindStateKey]) return;
    const defaults = columns.filter((column) => column.defaultHidden).map((column) => column.key);
    if (defaults.length === 0) return;
    updateKindState(clusterId, resource.apiVersion, resource.kind, { hiddenColumns: defaults });
  }, [kindStateKey, resource, columns, kindStates, clusterId, updateKindState]);

  const hidden = useMemo(() => new Set(kindState.hiddenColumns), [kindState.hiddenColumns]);
  const pinnedKeys = useMemo(() => new Set(kindState.pinnedColumns), [kindState.pinnedColumns]);
  const visible = useMemo(() => {
    const shown = columns.filter((column) => !hidden.has(column.key));
    if (pinnedKeys.size === 0) return shown;
    const pinned = shown.filter((column) => pinnedKeys.has(column.key));
    const rest = shown.filter((column) => !pinnedKeys.has(column.key));
    return [...pinned, ...rest];
  }, [columns, hidden, pinnedKeys]);
  const claimPods = useClaimPods({
    clusterId,
    resource,
    namespaces: selectedNamespaces,
    active,
    refreshSeconds,
  });
  const serviceEndpoints = useServiceEndpoints({
    clusterId,
    resource,
    namespaces: selectedNamespaces,
    active,
    refreshSeconds,
  });
  const warningEvents = useWarningEvents({
    clusterId,
    namespaces: selectedNamespaces,
    active: active && WARNING_KINDS.has(resource?.kind ?? ""),
    refreshSeconds,
  });
  const nodePodCounts = useNodePodCounts({
    clusterId,
    active: active && resource?.kind === "Node",
    refreshSeconds,
  });
  const openRef = (target: { kind: string; name: string; namespace?: string; apiVersion?: string }) => {
    const lower = target.kind.toLowerCase();
    const match = resources.find(
      (entry) => entry.kind.toLowerCase() === lower && (!target.apiVersion || entry.apiVersion === target.apiVersion),
    );
    const apiVersion = target.apiVersion ?? match?.apiVersion;
    if (!apiVersion) {
      toast.error("Cannot open resource", `${target.kind} is not discovered in this cluster.`);
      return;
    }
    const namespaced = match ? match.namespaced : Boolean(target.namespace);
    const namespace = namespaced
      ? (target.namespace ??
        list.items.find((item) => item.metadata?.name === target.name)?.metadata?.namespace ??
        selectedNamespaces[0])
      : undefined;
    openDetails(clusterId, {
      clusterId,
      apiVersion,
      kind: match?.kind ?? target.kind,
      namespace,
      name: target.name,
    });
  };

  const metrics = useResourceMetrics({
    clusterId,
    resource,
    resources,
    namespaces: selectedNamespaces,
    refreshSeconds,
    active: active && visible.some((column) => column.key === "cpu" || column.key === "memory"),
  });

  const cellContext = useMemo<CellContext>(
    () => ({
      showNamespace,
      claimPods,
      serviceEndpoints,
      warnings: warningEvents,
      nodePodCounts,
      podMetrics: metrics.pods,
      nodeMetrics: metrics.nodes,
    }),
    [showNamespace, claimPods, serviceEndpoints, warningEvents, nodePodCounts, metrics],
  );

  const searchError = useMemo(() => {
    if (!kindState.search || !kindState.regex) return false;
    try {
      new RegExp(kindState.search);
      return false;
    } catch {
      return true;
    }
  }, [kindState.search, kindState.regex]);

  // A10: the input writes the store per keystroke (the box stays instant),
  // but the full inventory scan runs only after typing pauses.
  const debouncedSearch = useDebouncedValue(kindState.search, 200);

  const [problemsOnly, setProblemsOnly] = useState(false);

  // A20: which columns can be filtered is a property of the columns. The
  // option lists used to be built for every filterable column over the whole
  // inventory on every list/context change; they are now built when the
  // popover opens (`filterOptions` below).
  const filterableKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const column of columns) {
      if (!column.filterValue) continue;
      // Namespace has a dedicated scope picker, so it must not open a second
      // namespace menu from the column header.
      if (column.key === "namespace") continue;
      keys.add(column.key);
    }
    return keys;
  }, [columns]);

  // A11: the search haystack (name, namespace, every column value, label
  // keys) is built once per list/columns/context change — and only while a
  // search is active — instead of per keystroke for every row.
  const searching = debouncedSearch.trim().length > 0;
  const haystacks = useMemo(() => {
    if (!searching) return null;
    const built = new Array<string>(list.items.length);
    for (let index = 0; index < list.items.length; index += 1) {
      const row = list.items[index];
      built[index] = [
        row.metadata?.name,
        row.metadata?.namespace,
        ...columns.map((column) => column.value?.(row, cellContext)),
        ...Object.keys(row.metadata?.labels ?? {}),
      ]
        .filter((value) => value !== undefined && value !== null)
        .join(" ")
        .toLowerCase();
    }
    return built;
  }, [searching, list.items, columns, cellContext]);

  // A20: one pass over the inventory that counts problems and applies the
  // search, the Problems toggle and the column filters together — three
  // separate memos used to walk the whole list on every change.
  const { rows: filtered, problemCount } = useMemo(() => {
    const term = debouncedSearch.trim();
    let regex: RegExp | null = null;
    if (term && kindState.regex) {
      try {
        regex = new RegExp(term, "i");
      } catch {
        regex = null;
      }
    }
    const needle = term.toLowerCase();
    const filterColumns = Object.entries(kindState.filters)
      .filter(([, values]) => values.length > 0)
      .map(([key, values]) => ({ column: columns.find((entry) => entry.key === key), values }));
    const hay = haystacks;
    const useSearch = searching && hay !== null;
    const narrowing = useSearch || (problemsOnly && Boolean(resource)) || filterColumns.length > 0;

    let problems = 0;
    const rows: KubeObject[] = [];
    for (let index = 0; index < list.items.length; index += 1) {
      const row = list.items[index];
      let isProblem = false;
      if (resource) {
        const tone = resourceStatus(row, resource.kind).tone;
        isProblem = tone === "warning" || tone === "error";
        if (isProblem) problems += 1;
      }
      if (!narrowing) continue;
      if (useSearch) {
        const entry = hay![index];
        if (regex ? !regex.test(entry) : !entry.includes(needle)) continue;
      }
      if (problemsOnly && resource && !isProblem) continue;
      let passes = true;
      for (const { column, values } of filterColumns) {
        const value = column?.filterValue?.(row);
        if (value === undefined || !values.includes(value)) {
          passes = false;
          break;
        }
      }
      if (!passes) continue;
      rows.push(row);
    }
    return narrowing ? { rows, problemCount: problems } : { rows: list.items, problemCount: problems };
  }, [
    list.items,
    resource,
    debouncedSearch,
    searching,
    haystacks,
    kindState.regex,
    kindState.filters,
    problemsOnly,
    columns,
  ]);

  const sortedRef = useRef<ReturnType<typeof sortObjects>>([]);
  const sorted = useMemo(() => {
    const sortColumn = columns.find((column) => column.key === effectiveSort.key);
    const next = sortObjects(filtered, sortColumn, effectiveSort.direction, cellContext);
    // A12: keep the previous identity when the order did not change (context
    // refreshes rebuild the same order) so the memoized table rows skip.
    const prev = sortedRef.current;
    if (prev.length === next.length && next.every((row, index) => row === prev[index])) return prev;
    sortedRef.current = next;
    return next;
  }, [filtered, effectiveSort.key, effectiveSort.direction, columns, cellContext]);

  const [filterPanel, setFilterPanel] = useState<{ key: string; x: number; y: number } | null>(null);
  const [menu, setMenu] = useState<{ object: KubeObject; x: number; y: number } | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  // A20: filter option lists are built only while the popover is open, from
  // the current rows — closing it costs nothing on later list changes.
  const filterOptions = useMemo(() => {
    if (!filterPanel) return EMPTY_FILTER_OPTIONS;
    const column = columns.find((entry) => entry.key === filterPanel.key);
    return column ? buildFilterOptions(list.items, column, cellContext) : EMPTY_FILTER_OPTIONS;
  }, [filterPanel, list.items, columns, cellContext]);

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
    if (filterPanel && !filterableKeys.has(filterPanel.key)) setFilterPanel(null);
  }, [filterPanel, filterableKeys]);

  useEffect(() => {
    setSelectedKeys(new Set());
    setProblemsOnly(false);
  }, [kindStateKey, selectedNamespaces.join(",")]);

  // Search and column filters run client-side over loaded rows. Pull the
  // remaining pages, so a name in page 2/3 (4000+ inventories) is still found.
  const wantsEveryPage =
    debouncedSearch.trim().length > 0 ||
    Object.values(kindState.filters).some((values) => values.length > 0);
  useEffect(() => {
    if (!wantsEveryPage || !list.hasMore) return;
    void list.loadAll();
  }, [wantsEveryPage, list.hasMore, list.loadAll]);

  if (!hasSession) return null;

  const setKindPatch = (patch: Partial<typeof kindState>) => {
    if (!resource) return;
    updateKindState(clusterId, resource.apiVersion, resource.kind, patch);
  };

  const onSort = (key: string) => {
    // Explicit sorts are two-state and are persisted per kind; the first click
    // on a new column sorts ascending, the next one descending.
    const next: TableSort =
      effectiveSort.key === key && effectiveSort.direction === "asc"
        ? { key, direction: "desc" }
        : { key, direction: "asc" };
    setKindPatch({ sort: next });
    if (!columnOrderKey) return;
    void updateSettings({
      tableSorts: { ...(settings?.tableSorts ?? {}), [columnOrderKey]: next },
    });
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

  const openAttach = async (object: KubeObject) => {
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
        mode: "attach",
      });
    } catch (error) {
      toast.error("Cannot attach to pod", errorText(error));
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

  // A/B for the diff follow the order the user sees: the first selected row in
  // the table is the original side. `list.items` order can differ after sorting.
  const selectedInView = sorted.filter((object) => selectedKeys.has(rowKey(object)));
  const diffPair = selectedInView.length === 2 ? selectedInView : selectedObjects.length === 2 ? selectedObjects : [];
  /** Full identity of a row — used by the diff and by the compare pin. */
  const diffTarget = (object: KubeObject | undefined): ResourceKey | null =>
    object
      ? {
          clusterId,
          apiVersion: object.apiVersion ?? resource?.apiVersion ?? "",
          kind: object.kind ?? resource?.kind ?? "",
          namespace: object.metadata?.namespace,
          name: object.metadata?.name ?? "",
        }
      : null;
  const sameTarget = (a: ResourceKey, b: ResourceKey) =>
    a.clusterId === b.clusterId &&
    a.apiVersion === b.apiVersion &&
    a.kind === b.kind &&
    (a.namespace ?? "") === (b.namespace ?? "") &&
    a.name === b.name;
  const clusterName = (id: string) =>
    allClusters.find((cluster) => cluster.id === id)?.name ?? id.split("::").pop() ?? id;

  const presetEntries = (field: "labels" | "annotations"): Array<[string, string]> =>
    Object.entries(
      (field === "labels" ? settings?.labelPresets : settings?.annotationPresets) ?? {},
    ).sort(([left], [right]) => left.localeCompare(right));

  /** Writes one saved label onto every selected resource (merge patch). */
  const applyMetadataField = async (field: "labels" | "annotations", key: string, value: string) => {
    if (!resource || selectedObjects.length === 0) return;
    setBusy(true);
    let updated = 0;
    const failures: string[] = [];
    for (const object of selectedObjects) {
      try {
        await call(
          api.resources.patch({
            clusterId,
            apiVersion: object.apiVersion ?? resource.apiVersion,
            kind: object.kind ?? resource.kind,
            namespace: object.metadata?.namespace,
            name: object.metadata?.name ?? "",
            patch: { metadata: { [field]: { [key]: value } } },
          }),
        );
        updated += 1;
      } catch (patchError) {
        failures.push(`${object.metadata?.name}: ${errorText(patchError)}`);
      }
    }
    setBusy(false);
    setDialog(null);
    await list.refresh(true);
    if (failures.length === 0) {
      toast.success(`${field === "labels" ? "Label" : "Annotation"} set on ${updated} resource${updated === 1 ? "" : "s"}`, `${key}=${value}`);
      // Deliberately keep the selection: a second preset is often applied to
      // the same rows right away (and delete/annotate flows are separate).
    } else {
      toast.error(`Updated ${updated}, failed ${failures.length}`, failures.slice(0, 4).join("\n"));
    }
  };

  /** Applies every ticked saved annotation to every selected resource. */
  const applyAnnotations = async (keys: string[]) => {
    if (!resource || selectedObjects.length === 0 || keys.length === 0) return;
    const saved = settings?.annotationPresets ?? {};
    const annotations: Record<string, string> = {};
    for (const key of keys) {
      const value = saved[key];
      if (value !== undefined) annotations[key] = value;
    }
    const appliedKeys = Object.keys(annotations);
    if (appliedKeys.length === 0) return;

    setBusy(true);
    let updated = 0;
    const failures: string[] = [];
    for (const object of selectedObjects) {
      try {
        await call(
          api.resources.patch({
            clusterId,
            apiVersion: object.apiVersion ?? resource.apiVersion,
            kind: object.kind ?? resource.kind,
            namespace: object.metadata?.namespace,
            name: object.metadata?.name ?? "",
            patch: { metadata: { annotations } },
          }),
        );
        updated += 1;
      } catch (patchError) {
        failures.push(`${object.metadata?.name}: ${errorText(patchError)}`);
      }
    }
    setBusy(false);
    setDialog(null);
    await list.refresh(true);
    if (failures.length === 0) {
      toast.success(
        `${appliedKeys.length} annotation${appliedKeys.length === 1 ? "" : "s"} set on ${updated} resource${updated === 1 ? "" : "s"}`,
        appliedKeys.join("\n"),
      );
      // Selection stays on purpose — annotating is not destructive and the
      // same rows often get another preset afterwards.
    } else {
      toast.error(`Updated ${updated}, failed ${failures.length}`, failures.slice(0, 4).join("\n"));
    }
  };

  /** The shared dropdown body for the Labels / Annotate buttons. */
  const presetMenu = (field: "labels" | "annotations") => ({ close }: { close: () => void }) => {
    const entries = presetEntries(field);
    const noun = field === "labels" ? "label" : "annotation";
    return (
      <>
        <MenuLabel>
          {field === "labels" ? "Label" : "Annotate"} {selectedKeys.size} selected
        </MenuLabel>
        {entries.length === 0 ? (
          <div className="px-2 py-1.5 text-[calc(11px*var(--font-scale))] text-theme-text-tertiary">
            No saved {noun}s yet — add one below.
          </div>
        ) : null}
        {entries.map(([key, value]) => (
          <MenuItem
            key={key}
            icon={<Tags className="h-3.5 w-3.5" />}
            onClick={() => {
              setDialog({ type: "bulk-apply", applyField: field, applyKey: key, applyValue: value });
              close();
            }}
          >
            <span className="truncate font-mono" title={`${key}=${value}`}>
              {key}={value}
            </span>
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem
          icon={<Pencil className="h-3.5 w-3.5" />}
          onClick={() => {
            setDialog({ type: "presets", presetField: field });
            close();
          }}
        >
          Manage {noun}s…
        </MenuItem>
      </>
    );
  };

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
          force: dialog.force,
        }),
      );
      toast.success(dialog.force ? "Resource force-deleted" : "Resource deleted", `${resource.kind}/${dialog.object.metadata?.name}`);
      setDialog(null);
      await list.refresh(true);
    } catch (error) {
      toast.error(dialog.force ? "Force delete failed" : "Delete failed", errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const restartObject = async () => {
    if (!resource || !dialog?.object) return;
    setBusy(true);
    try {
      await restartWorkload({
        clusterId,
        apiVersion: resource.apiVersion,
        kind: resource.kind,
        namespace: dialog.object.metadata?.namespace,
        name: dialog.object.metadata?.name,
      });
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
      await scaleWorkload(
        {
          clusterId,
          apiVersion: resource.apiVersion,
          kind: resource.kind,
          namespace: dialog.object.metadata?.namespace,
          name: dialog.object.metadata?.name,
        },
        replicas,
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

  if (selectedKind?.kind === "__overview__") {
    return <ClusterOverview clusterId={clusterId} active={active} />;
  }

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
  const caps = workloadCapabilities(resource.kind, resource.apiVersion);
  const canScale = caps.scalable;
  const canRestart = caps.restartable;
  const canPause = caps.pausable;
  const canSuspend = caps.suspendable;
  const isPod = lowerKind === "pod";
  const isNode = lowerKind === "node";

  const toggleCordon = async (object: KubeObject) => {
    if (!resource) return;
    const cordoned = Boolean(object.spec?.unschedulable);
    try {
      await call(
        api.resources.patch({
          clusterId,
          apiVersion: resource.apiVersion,
          kind: resource.kind,
          namespace: object.metadata?.namespace,
          name: object.metadata?.name,
          patch: { spec: { unschedulable: !cordoned } },
        }),
      );
      toast.success(cordoned ? "Node uncordoned" : "Node cordoned", object.metadata?.name);
      await list.refresh(true);
    } catch (error) {
      toast.error(cordoned ? "Uncordon failed" : "Cordon failed", errorText(error));
    }
  };

  const toggleSuspend = async (object: KubeObject) => {
    if (!resource) return;
    const suspended = isSuspended(object);
    try {
      await setWorkloadSuspended(
        {
          clusterId,
          apiVersion: resource.apiVersion,
          kind: resource.kind,
          namespace: object.metadata?.namespace,
          name: object.metadata?.name,
        },
        !suspended,
      );
      toast.success(suspended ? "Resource resumed" : "Resource suspended", object.metadata?.name);
      await list.refresh(true);
    } catch (error) {
      toast.error(suspended ? "Resume failed" : "Suspend failed", errorText(error));
    }
  };

  const togglePause = async (object: KubeObject) => {
    if (!resource) return;
    const paused = isDeploymentPaused(object);
    try {
      await setWorkloadPaused(
        {
          clusterId,
          apiVersion: resource.apiVersion,
          kind: resource.kind,
          namespace: object.metadata?.namespace,
          name: object.metadata?.name,
        },
        !paused,
      );
      toast.success(paused ? "Rollout resumed" : "Rollout paused", object.metadata?.name);
      await list.refresh(true);
    } catch (error) {
      toast.error(paused ? "Resume failed" : "Pause failed", errorText(error));
    }
  };
  const triggerObject = async (object: KubeObject) => {
    try {
      const name = await triggerCronJob(clusterId, object);
      toast.success("CronJob triggered", `Created Job ${name}`);
      await list.refresh(true);
    } catch (error) {
      toast.error("Trigger failed", errorText(error));
    }
  };
  const contextObject = menu?.object;
  const contextTarget = diffTarget(contextObject);
  const contextIsPinned = Boolean(contextTarget && compareSelection && sameTarget(contextTarget, compareSelection));

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-theme-surface">
      <div className="flex h-12 min-w-0 shrink-0 items-center gap-2 overflow-hidden border-b border-theme-border bg-theme-base px-3">
        <Icon className="h-4 w-4 shrink-0 text-accent-text" />
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="truncate text-[calc(14px*var(--font-scale))] font-semibold text-theme-text-primary">
            {kindLabel(resource.kind, resource.plural)}
          </h1>
          <span className="font-mono text-[calc(11px*var(--font-scale))] text-theme-text-tertiary tabular-nums">
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
              namespaces={namespaces}
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

          {[...filterableKeys].slice(0, 3).map((key) => {
            const column = columns.find((entry) => entry.key === key);
            if (!column) return null;
            const count = kindState.filters[key]?.length ?? 0;
            return (
              <button
                key={key}
                type="button"
                onClick={(event) => openFilter(column, event)}
                className={cn(
                  "hidden h-8 items-center gap-1 rounded-lg border px-2 text-[calc(11px*var(--font-scale))] transition-colors lg:flex",
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
            pinned={pinnedKeys}
            onTogglePin={(key) =>
              setKindPatch({
                pinnedColumns: pinnedKeys.has(key)
                  ? kindState.pinnedColumns.filter((entry) => entry !== key)
                  : [...kindState.pinnedColumns, key],
              })
            }
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
              "flex h-8 items-center gap-1 rounded-lg border px-2 text-[calc(11px*var(--font-scale))] transition-colors",
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
            title="Reload data (does not restart workloads)"
            disabled={list.loading}
          >
            <RotateCw className={cn("h-4 w-4", list.loading && "animate-spin")} />
          </button>

          {resource?.kind === "HelmRelease" ? null : (
            <Button
              variant="primary"
              size="sm"
              title="Create resources from YAML in the bottom dock"
              onClick={() => openYamlTab(clusterId)}
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">Create</span>
              <span className="xl:hidden">YAML</span>
            </Button>
          )}
        </div>
      </div>

      {/* Toolbar above spans the full width; the table and the editor area
          share this row, so the editor starts under Create/Search/live. */}
      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {compareSelection ? (
        <div className="flex h-8 shrink-0 items-center gap-2 border-b border-theme-border bg-skyhook-500/10 px-3 text-[calc(11px*var(--font-scale))]">
          <ArrowLeftRight className="h-3 w-3 shrink-0 text-accent-text" />
          <span className="shrink-0 text-accent-text">For comparison</span>
          <span className="min-w-0 truncate font-mono text-[calc(11px*var(--font-scale))] text-theme-text-primary">
            {compareSelection.kind}/{compareSelection.namespace ? `${compareSelection.namespace}/` : ""}
            {compareSelection.name}
          </span>
          <span className="shrink-0 text-theme-text-tertiary">· {clusterName(compareSelection.clusterId)}</span>
          <span className="ml-auto hidden min-w-0 truncate text-theme-text-tertiary lg:inline">
            Open another resource&apos;s ⋮ menu → Compare with selected
          </span>
          <button
            type="button"
            className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-theme-text-secondary hover:bg-theme-hover hover:text-theme-text-primary lg:ml-0"
            title="Clear comparison selection"
            onClick={() => setCompareSelection(null)}
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        </div>
      ) : null}

      {problemsOnly ? (
        <div className="flex h-7 shrink-0 items-center gap-2 border-b border-theme-border bg-amber-500/5 px-3 text-[calc(11px*var(--font-scale))] text-amber-700 dark:text-amber-300">
          <TriangleExclamationPoint className="h-3 w-3" />
          Showing {problemCount} resource{problemCount === 1 ? "" : "s"} with warning/error status
          <button type="button" className="ml-auto underline" onClick={() => setProblemsOnly(false)}>
            clear
          </button>
        </div>
      ) : null}

      {activeFilterChips.length > 0 ? (
        <div className="flex h-8 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-theme-border bg-theme-base/60 px-3">
          <span className="text-[calc(10px*var(--font-scale))] uppercase tracking-wide text-theme-text-tertiary">Filters</span>
          {activeFilterChips.map((chip) => (
            <span
              key={chip.key}
              className="flex items-center gap-1 rounded-md border border-skyhook-500/30 bg-skyhook-500/10 px-1.5 py-0.5 text-[calc(11px*var(--font-scale))] text-accent-text"
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
            className="ml-auto shrink-0 text-[calc(11px*var(--font-scale))] text-theme-text-tertiary hover:text-theme-text-primary"
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
          sort={effectiveSort}
          onSort={onSort}
          selectedRef={selectedRef}
          onOpen={(object) => openTab(object)}
          onContextMenu={(object, event) => {
            // Helm releases have no mutating actions: the menu would only offer
            // API calls that cannot succeed.
            if (resource?.kind === "HelmRelease") return;
            setMenu({ object, x: event.clientX, y: event.clientY });
          }}
          onRowMenu={(object, event) => {
            if (resource?.kind === "HelmRelease") return;
            const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
            setMenu({ object, x: rect.left, y: rect.bottom + 4 });
          }}
          onBackgroundClick={() => {
            if (selectedRef) closeDetails(clusterId);
          }}
          pinnedKeys={pinnedKeys}
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
          filterableKeys={filterableKeys}
          rowHeight={settings?.tableRowHeight ?? 44}
          podMetrics={metrics.pods}
          nodeMetrics={metrics.nodes}
          onSelectNamespace={(namespace) => setSelectedNamespaces(clusterId, [namespace])}
          onOpenNode={(name) =>
            openDetails(clusterId, { clusterId, apiVersion: "v1", kind: "Node", name })
          }
          onOpenRef={openRef}
          claimPods={claimPods}
          serviceEndpoints={serviceEndpoints}
          warnings={warningEvents}
          nodePodCounts={nodePodCounts}
          hideRowMenu={resource?.kind === "HelmRelease"}
          selectionMode={resource?.kind !== "HelmRelease"}
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
        <div className="flex h-8 shrink-0 items-center gap-2 border-b border-theme-border bg-skyhook-500/10 px-3 text-[calc(11px*var(--font-scale))]">
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
            <Menu width={280} trigger={({ toggle }) => (
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={toggle}
                  title="Apply a saved label to the selected resources"
                >
                  <Tags className="h-3 w-3" />
                  Labels
                </Button>
              )}
            >
              {presetMenu("labels")}
            </Menu>
            <Button
              variant="secondary"
              size="xs"
              title="Apply saved annotations to the selected resources"
              onClick={() => setDialog({ type: "bulk-annotate" })}
            >
              <Tags className="h-3 w-3" />
              Annotate
            </Button>
            <Button
              variant="secondary"
              size="xs"
              title="Copy the selected resource names"
              onClick={() => setDialog({ type: "copy-names" })}
            >
              <Copy className="h-3 w-3" />
              <span className="hidden xl:inline">Copy names</span>
            </Button>
            {resource?.kind === "HelmRelease" ? null : (
              <Button
                variant="secondary"
                size="xs"
                disabled={diffPair.length !== 2}
                title={
                  diffPair.length === 2
                    ? `Diff ${diffPair[0].metadata?.name} ↔ ${diffPair[1].metadata?.name}`
                    : "Select exactly two resources to compare their YAML"
                }
                onClick={() =>
                  setDialog({
                    type: "diff",
                    diffLeft: diffTarget(diffPair[0]) ?? undefined,
                    diffRight: diffTarget(diffPair[1]) ?? undefined,
                  })
                }
              >
                <Diff className="h-3 w-3" />
                <span className="hidden xl:inline">Diff</span>
              </Button>
            )}
            <Button variant="danger" size="xs" onClick={() => setDialog({ type: "bulk-delete" })}>
              <Trash2 className="h-3 w-3" />
              Delete selected
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex h-7 shrink-0 items-center gap-3 border-t border-theme-border bg-theme-base px-3 text-[calc(10px*var(--font-scale))] text-theme-text-tertiary">
        <span>
          {list.items.length} loaded
          {list.total !== null && list.total > list.items.length ? ` of ${list.total}` : ""}
        </span>
        {list.loadingAll ? (
          <span className="text-accent-text">fetching all pages for search…</span>
        ) : null}
        <span className="text-theme-text-disabled">·</span>
        <span className="font-mono">{resource.apiVersion}/{resource.kind}</span>
        <span className="text-theme-text-disabled">·</span>
        <span>{resource.isCrd ? "Custom resource" : "Built-in resource"}</span>
        {list.hasMore ? (
          <button
            type="button"
            className="ml-auto text-accent-text hover:underline disabled:opacity-50"
            onClick={() => void list.loadMore()}
            disabled={list.loadingAll}
            title="Fetch the next page; the table only renders the visible rows"
          >
            {list.loadingAll ? (
              "Loading…"
            ) : (
              <>
                Load more
                {list.total !== null
                  ? ` (+${Math.max(0, list.total - list.items.length)})`
                  : ""}
              </>
            )}
          </button>
        ) : (
          <span className="ml-auto">{filtered.length} visible</span>
        )}
      </div>

        </div>
        {side}
        {overlay}
      </div>

      {filterPanel ? (
        <FilterPopover
          x={filterPanel.x}
          y={filterPanel.y}
          column={columns.find((column) => column.key === filterPanel.key)!}
          options={filterOptions}
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
          Edit YAML
        </MenuItem>
        <MenuItem
          icon={<Diff className="h-3.5 w-3.5" />}
          onClick={() => {
            if (contextTarget) {
              setCompareSelection(contextTarget);
              toast.success(
                "Selected for comparison",
                `${contextTarget.kind}/${contextTarget.name} · ${clusterName(contextTarget.clusterId)}`,
              );
            }
            setMenu(null);
          }}
        >
          Select for comparison
        </MenuItem>
        {compareSelection && contextTarget ? (
          contextIsPinned ? (
            <MenuItem
              icon={<X className="h-3.5 w-3.5" />}
              onClick={() => {
                setCompareSelection(null);
                setMenu(null);
              }}
            >
              Clear comparison selection
            </MenuItem>
          ) : (
            <MenuItem
              icon={<ArrowLeftRight className="h-3.5 w-3.5" />}
              onClick={() => {
                setDialog({ type: "diff", diffLeft: compareSelection, diffRight: contextTarget });
                setMenu(null);
              }}
            >
              Compare with selected
            </MenuItem>
          )
        ) : null}
        <MenuItem
          icon={<Tags className="h-3.5 w-3.5" />}
          onClick={() => {
            setDialog({ type: "labels", object: contextObject });
            setMenu(null);
          }}
        >
          Labels / annotations…
        </MenuItem>        {isPod ? (
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
              if (contextObject) void openAttach(contextObject);
              setMenu(null);
            }}
          >
            Attach
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
            Exec shell
          </MenuItem>
        ) : null}
        {isNode ? (
          <MenuItem
            icon={<Ban className="h-3.5 w-3.5" />}
            onClick={() => {
              if (contextObject) void toggleCordon(contextObject);
              setMenu(null);
            }}
          >
            {contextObject?.spec?.unschedulable ? "Uncordon node" : "Cordon node"}
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
            icon={<RotateCcw className="h-3.5 w-3.5" />}
            onClick={() => {
              if (isDeploymentPaused(contextObject)) {
                toast.error("Rollout is paused", "Resume the rollout before restarting it.");
                setMenu(null);
                return;
              }
              setDialog({ type: "restart", object: contextObject });
              setMenu(null);
            }}
          >
            Restart rollout…
          </MenuItem>
        ) : null}
        {canPause ? (
          <MenuItem
            icon={isDeploymentPaused(contextObject) ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            onClick={() => {
              if (contextObject) void togglePause(contextObject);
              setMenu(null);
            }}
          >
            {isDeploymentPaused(contextObject) ? "Resume rollout" : "Pause rollout"}
          </MenuItem>
        ) : null}
        {canSuspend ? (
          <MenuItem
            icon={isSuspended(contextObject) ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            onClick={() => {
              if (contextObject) void toggleSuspend(contextObject);
              setMenu(null);
            }}
          >
            {isSuspended(contextObject) ? "Resume" : "Suspend"}
          </MenuItem>
        ) : null}
        {caps.imageEditable ? (
          <MenuItem
            icon={<Box className="h-3.5 w-3.5" />}
            onClick={() => {
              setDialog({ type: "set-image", object: contextObject });
              setMenu(null);
            }}
          >
            Set image…
          </MenuItem>
        ) : null}
        {caps.triggerable ? (
          <MenuItem
            icon={<Play className="h-3.5 w-3.5" />}
            onClick={() => {
              if (contextObject) void triggerObject(contextObject);
              setMenu(null);
            }}
          >
            Trigger now
          </MenuItem>
        ) : null}
        {isNode ? (
          <MenuItem
            icon={<Server className="h-3.5 w-3.5" />}
            onClick={() => {
              setDialog({ type: "drain", object: contextObject });
              setMenu(null);
            }}
          >
            Drain node…
          </MenuItem>
        ) : null}
        {isNode ? (
          <MenuItem
            icon={<SquareTerminal className="h-3.5 w-3.5" />}
            onClick={() => {
              setDialog({ type: "debug", object: contextObject });
              setMenu(null);
            }}
          >
            Debug shell…
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
                `kubectl get ${resource.plural} ${contextObject.metadata?.name}${namespaceFlag} --context ${sessionInfo?.context ?? ""}`,
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
        <MenuItem
          danger
          icon={<TriangleExclamationPoint className="h-3.5 w-3.5" />}
          onClick={() => {
            setDialog({ type: "delete", object: contextObject, force: true });
            setMenu(null);
          }}
        >
          Force delete…
        </MenuItem>
      </ContextMenu>

      <SetImageDialog
        open={dialog?.type === "set-image"}
        onClose={() => setDialog(null)}
        clusterId={clusterId}
        object={dialog?.object ?? null}
        onSaved={() => void list.refresh(true)}
      />

      <LabelsAnnotationsDialog
        open={dialog?.type === "labels"}
        onClose={() => setDialog(null)}
        clusterId={clusterId}
        object={
          dialog?.type === "labels" && dialog.object?.metadata?.name
            ? {
                apiVersion: dialog.object.apiVersion ?? resource.apiVersion,
                kind: dialog.object.kind ?? resource.kind,
                namespace: dialog.object.metadata?.namespace,
                name: dialog.object.metadata.name,
                labels: dialog.object.metadata?.labels as Record<string, string> | undefined,
                annotations: dialog.object.metadata?.annotations as Record<string, string> | undefined,
              }
            : null
        }
        onSaved={() => void list.refresh(true)}
      />

      <NodeDrainDialog
        open={dialog?.type === "drain"}
        onClose={() => setDialog(null)}
        clusterId={clusterId}
        node={dialog?.object?.metadata?.name ?? ""}
        onDone={() => void list.refresh(true)}
      />

      <NodeDebugDialog
        open={dialog?.type === "debug"}
        onClose={() => setDialog(null)}
        clusterId={clusterId}
        nodeName={dialog?.object?.metadata?.name ?? ""}
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
        title={dialog?.force ? `Force delete ${resource.kind}` : `Delete ${resource.kind}`}
        confirmLabel={dialog?.force ? "Force delete" : "Delete resource"}
        danger
        busy={busy}
        description={
          <>
            <p>
              {dialog?.force ? "Force delete " : "Delete "}
              <span className="font-medium text-theme-text-primary">{dialog?.object?.metadata?.name}</span>
              {dialog?.object?.metadata?.namespace ? ` in ${dialog.object.metadata.namespace}` : ""}?
            </p>
            <p className="mt-2 text-xs text-theme-text-tertiary">
              {dialog?.force
                ? "The API server is asked for grace period 0 (kubectl delete --force --grace-period=0). Pods may be terminated abruptly."
                : "Dependents use the Background propagation policy. This action cannot be undone."}
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
            <ul className="mt-2 max-h-40 overflow-y-auto rounded border border-theme-border bg-theme-base p-2 font-mono text-[calc(11px*var(--font-scale))]">
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
        open={dialog?.type === "bulk-apply"}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          const field = dialog?.applyField;
          const key = dialog?.applyKey;
          if (field && key) void applyMetadataField(field, key, dialog?.applyValue ?? "true");
        }}
        title={dialog?.applyField === "labels" ? "Apply label" : "Apply annotation"}
        confirmLabel={`Apply to ${selectedObjects.length} ${resource.kind}${selectedObjects.length === 1 ? "" : "s"}`}
        busy={busy}
        description={
          <>
            <p>
              Set <span className="inline-code font-mono">{dialog?.applyKey}={dialog?.applyValue}</span> on{" "}
              <span className="font-medium text-theme-text-primary">{selectedObjects.length}</span> selected{" "}
              {resource.kind}
              {selectedObjects.length === 1 ? "" : "s"} as a{" "}
              {dialog?.applyField === "labels" ? "label" : "annotation"}?
            </p>
            <p className="mt-2 text-xs text-theme-text-tertiary">
              A merge patch adds this key; existing keys stay untouched.
            </p>
          </>
        }
      />

      <BulkAnnotationsDialog
        open={dialog?.type === "bulk-annotate"}
        onClose={() => setDialog(null)}
        presets={presetEntries("annotations")}
        targetCount={selectedObjects.length}
        kind={resource.kind}
        busy={busy}
        onApply={(keys) => void applyAnnotations(keys)}
        onManage={() => setDialog({ type: "presets", presetField: "annotations" })}
      />

      <PresetDialog
        open={dialog?.type === "presets"}
        field={dialog?.presetField ?? "annotations"}
        onClose={() => setDialog(null)}
      />

      <CopyNamesDialog
        open={dialog?.type === "copy-names"}
        onClose={() => setDialog(null)}
        items={selectedObjects.map((object) => ({
          name: object.metadata?.name ?? "",
          namespace: object.metadata?.namespace,
        }))}
      />

      <ResourceDiffDialog
        open={dialog?.type === "diff"}
        onClose={() => setDialog(null)}
        left={dialog?.diffLeft ?? null}
        right={dialog?.diffRight ?? null}
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
    <div className="ml-2 hidden items-center gap-1.5 text-[calc(10px*var(--font-scale))] text-theme-text-tertiary sm:flex">
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
