import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowUpDown, ChevronDown, ChevronUp, ListFilter, MoreHorizontal } from "lucide-react";
import type { KubeObject } from "@shared/types";
import type { NodeUsage, PodUsage } from "./useResourceMetrics";
import type { ColumnDef } from "../../lib/columns";
import { formatColumnWidth } from "../../lib/columns";
import { cn } from "../../lib/cn";
import { Spinner } from "../../design-system/components/Spinner";

const EMPTY_PINNED = new Set<string>();

interface ResourceTableProps {
  rows: KubeObject[];
  columns: ColumnDef[];
  showNamespace: boolean;
  sort: { key: string; direction: "asc" | "desc" } | null;
  onSort: (key: string) => void;
  selectedRef?: { namespace?: string; name: string } | null;
  onOpen: (object: KubeObject) => void;
  onContextMenu: (object: KubeObject, event: React.MouseEvent) => void;
  /** Opens the same row menu from the leading "…" button. */
  onRowMenu?: (object: KubeObject, event: React.MouseEvent) => void;
  /** Click on empty space inside the table (no row, control or header). */
  onBackgroundClick?: () => void;
  /** Columns frozen to the left edge while the table scrolls horizontally. */
  pinnedKeys?: Set<string>;
  onFilterColumn: (column: ColumnDef, event: React.MouseEvent) => void;
  columnWidths: Record<string, number>;
  onResizeEnd: (key: string, width: number, allWidths?: Record<string, number>) => void;
  onResetColumnWidth: (key: string) => void;
  filterableKeys: Set<string>;
  loading: boolean;
  emptyState?: React.ReactNode;
  selectionMode?: boolean;
  selectedKeys?: Set<string>;
  onToggleRow?: (object: KubeObject) => void;
  onToggleAll?: () => void;
  rowHeight?: number;
  /** Horizontal row/header separators; off = borderless table. */
  borders?: boolean;
  podMetrics?: Map<string, PodUsage>;
  nodeMetrics?: Map<string, NodeUsage>;
  onSelectNamespace?: (namespace: string) => void;
  onOpenNode?: (name: string) => void;
  onOpenRef?: (target: { kind: string; name: string; namespace?: string; apiVersion?: string }) => void;
  claimPods?: Map<string, string[]>;
  serviceEndpoints?: Map<string, number>;
  warnings?: Map<string, import("./useWarningEvents").WarningEntry>;
  /** Node name → scheduled pod count (Nodes table). */
  nodePodCounts?: Map<string, number>;
  /** Hides the sticky row-actions button (kinds with no applicable actions). */
  hideRowMenu?: boolean;
}

interface TableRowProps {
  object: KubeObject;
  columns: ColumnDef[];
  index: number;
  top: number;
  gridTemplate: string;
  stickyOffsets: Map<string, number>;
  rowHeight: number;
  borders: boolean;
  /** Animate `top` while the list is inserting/removing rows. */
  animateTop?: boolean;
  /** The details drawer points at this row. */
  selected: boolean;
  /** This row's checkbox is ticked. */
  checked: boolean;
  highlighted: boolean;
  selectionMode: boolean;
  hideRowMenu?: boolean;
  showNamespace: boolean;
  podMetrics?: Map<string, PodUsage>;
  nodeMetrics?: Map<string, NodeUsage>;
  claimPods?: Map<string, string[]>;
  serviceEndpoints?: Map<string, number>;
  warnings?: Map<string, import("./useWarningEvents").WarningEntry>;
  nodePodCounts?: Map<string, number>;
  onSelectNamespace?: (namespace: string) => void;
  onOpenNode?: (name: string) => void;
  onOpenRef?: (target: { kind: string; name: string; namespace?: string; apiVersion?: string }) => void;
  onOpen: (object: KubeObject) => void;
  onContextMenu: (object: KubeObject, event: React.MouseEvent) => void;
  onRowMenu?: (object: KubeObject, event: React.MouseEvent) => void;
  onToggleRow?: (object: KubeObject) => void;
  setHighlight: (index: number) => void;
}

/**
 * A16: one memoized row. The parent table re-renders on scroll, hover and
 * store writes; without this every re-render re-invoked every visible cell.
 * All callback props handed to rows are stable wrappers (see the `latest`
 * refs inside ResourceTable), so only real data changes re-render a row.
 */
const TableRow = memo(function TableRow({
  object,
  columns,
  index,
  top,
  gridTemplate,
  stickyOffsets,
  rowHeight,
  borders,
  animateTop,
  selected,
  checked,
  highlighted,
  selectionMode,
  hideRowMenu,
  showNamespace,
  podMetrics,
  nodeMetrics,
  claimPods,
  serviceEndpoints,
  warnings,
  nodePodCounts,
  onSelectNamespace,
  onOpenNode,
  onOpenRef,
  onOpen,
  onContextMenu,
  onRowMenu,
  onToggleRow,
  setHighlight,
}: TableRowProps) {
  return (
    <div
      role="row"
      aria-selected={selected}
      data-index={index}
      data-resource-row="true"
      className={cn(
        "group/row absolute left-0 top-0 grid w-full cursor-pointer transition-colors",
        borders && "border-b-subtle",
        animateTop && "transition-[top] duration-150 ease-out motion-reduce:transition-none",
        selected
          ? "selection-strong"
          : highlighted
            ? "selection selection-ring"
            : "hover:bg-theme-hover/40",
      )}
      style={{
        top,
        height: rowHeight,
        gridTemplateColumns: gridTemplate,
      }}
      onClick={() => {
        setHighlight(index);
        onOpen(object);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        setHighlight(index);
        onContextMenu(object, event);
      }}
    >
      {selectionMode ? (
        <div
          className={cn("flex items-center justify-center", borders && "border-r-subtle")}
          onClick={(event) => {
            event.stopPropagation();
            onToggleRow?.(object);
          }}
        >
          <input
            type="checkbox"
            checked={checked}
            readOnly
            className="h-3.5 w-3.5 rounded border-theme-border accent-skyhook-500"
          />
        </div>
      ) : null}

      {columns.map((column, cellIndex) => (
        <div
          key={column.key}
          role="cell"
          style={
            stickyOffsets.has(column.key)
              ? { position: "sticky", left: stickyOffsets.get(column.key), zIndex: 5 }
              : undefined
          }
          className={cn(
            "flex min-w-0 items-center overflow-hidden",
            column.compact ? "px-4" : "px-4",
            cellIndex !== columns.length - 1 && borders && "border-r-subtle",
            column.align === "right" && "justify-end",
            stickyOffsets.has(column.key) && (selected ? "selection-strong" : "bg-theme-surface"),
          )}
        >
          <div className="min-w-0 w-full">
            {column.cell(object, {
              showNamespace,
              podMetrics,
              nodeMetrics,
              onSelectNamespace,
              onOpenNode,
              onOpenRef,
              claimPods,
              serviceEndpoints,
              warnings,
              nodePodCounts,
            })}
          </div>
        </div>
      ))}
      <div
        style={{ position: "sticky", right: 0, zIndex: 6 }}
        className={cn(
          "flex items-center justify-center border-l-subtle",
          selected ? "selection-strong" : "bg-theme-surface",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {hideRowMenu ? null : (
          <button
            type="button"
            aria-label="Row actions"
            title="Actions"
            className="rounded p-1 text-theme-text-tertiary transition-colors hover:bg-theme-hover hover:text-theme-text-primary"
            onClick={(event) => {
              event.stopPropagation();
              onRowMenu?.(object, event);
            }}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
});

export function ResourceTable({
  rows,
  columns,
  showNamespace,
  sort,
  onSort,
  selectedRef,
  onOpen,
  onContextMenu,
  onFilterColumn,
  columnWidths,
  onResizeEnd,
  onResetColumnWidth,
  filterableKeys,
  loading,
  emptyState,
  selectionMode = true,
  selectedKeys = new Set<string>(),
  onToggleRow,
  onToggleAll,
  rowHeight = 44,
  borders = true,
  podMetrics,
  nodeMetrics,
  onSelectNamespace,
  onOpenNode,
  onOpenRef,
  claimPods,
  serviceEndpoints,
  warnings,
  nodePodCounts,
  hideRowMenu,
  onRowMenu,
  onBackgroundClick,
  pinnedKeys = EMPTY_PINNED,
}: ResourceTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [highlight, setHighlight] = useState(-1);
  const [previewWidths, setPreviewWidths] = useState<Record<string, number>>({});
  // A short `top` transition when the list gains/loses rows, so an inserted
  // resource pushes the others down smoothly instead of teleporting them.
  const [shiftRows, setShiftRows] = useState(false);
  const previousRows = useRef<{ length: number; first: string } | null>(null);

  useEffect(() => {
    const first =
      rows.length > 0
        ? `${rows[0].metadata?.uid ?? `${rows[0].metadata?.namespace ?? ""}/${rows[0].metadata?.name ?? ""}`}`
        : "";
    const previous = previousRows.current;
    previousRows.current = { length: rows.length, first };
    if (!previous) return;
    if (previous.length === rows.length && previous.first === first) return;
    setShiftRows(true);
    const timer = window.setTimeout(() => setShiftRows(false), 200);
    return () => window.clearTimeout(timer);
  }, [rows]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 16,
  });

  useEffect(() => {
    setHighlight((value) => (value >= rows.length ? -1 : value));
  }, [rows.length]);

  useEffect(() => {
    setHighlight(-1);
  }, [columns]);

  // Layout values are memoized: the row memo compares `gridTemplate` and
  // `stickyOffsets` by identity, so rebuilding them per render would defeat it.
  const effectiveWidths = useMemo(() => ({ ...columnWidths, ...previewWidths }), [columnWidths, previewWidths]);
  const stickyOffsets = useMemo(() => {
    const offsets = new Map<string, number>();
    let stickyLeft = selectionMode ? 40 : 0;
    for (const column of columns) {
      if (!pinnedKeys.has(column.key)) continue;
      offsets.set(column.key, stickyLeft);
      stickyLeft += effectiveWidths[column.key] ?? (column.flex ? 240 : (column.width ?? 140));
    }
    return offsets;
  }, [columns, pinnedKeys, selectionMode, effectiveWidths]);
  const gridTemplate = useMemo(
    () =>
      `${selectionMode ? "40px " : ""}${columns
        .map((column) => formatColumnWidth(column, effectiveWidths[column.key]))
        .join(" ")} 36px`,
    [columns, effectiveWidths, selectionMode],
  );
  const minWidth = useMemo(
    () =>
      (selectionMode ? 40 : 0) +
      36 +
      columns.reduce(
        (sum, column) => sum + (effectiveWidths[column.key] ?? (column.flex ? 240 : (column.width ?? 140))),
        0,
      ),
    [columns, effectiveWidths, selectionMode],
  );
  const allSelected = useMemo(
    () =>
      selectedKeys.size > 0 &&
      rows.length > 0 &&
      rows.every((row) => selectedKeys.has(row.metadata?.uid ?? `${row.metadata?.namespace}/${row.metadata?.name}`)),
    [rows, selectedKeys],
  );

  // A16: stable wrappers for the inline closures the browser passes in — the
  // row memo would otherwise see new function identities on every render.
  const latest = useRef({ onOpen, onContextMenu, onRowMenu, onToggleRow, onSelectNamespace, onOpenNode, onOpenRef });
  latest.current = { onOpen, onContextMenu, onRowMenu, onToggleRow, onSelectNamespace, onOpenNode, onOpenRef };
  const openRow = useCallback((object: KubeObject) => latest.current.onOpen(object), []);
  const contextRow = useCallback(
    (object: KubeObject, event: React.MouseEvent) => latest.current.onContextMenu(object, event),
    [],
  );
  const menuRow = useCallback(
    (object: KubeObject, event: React.MouseEvent) => latest.current.onRowMenu?.(object, event),
    [],
  );
  const toggleRow = useCallback((object: KubeObject) => latest.current.onToggleRow?.(object), []);
  const selectNamespace = useCallback(
    (namespace: string) => latest.current.onSelectNamespace?.(namespace),
    [],
  );
  const openNode = useCallback((name: string) => latest.current.onOpenNode?.(name), []);
  const openRef = useCallback(
    (target: { kind: string; name: string; namespace?: string; apiVersion?: string }) =>
      latest.current.onOpenRef?.(target),
    [],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlight((value) => {
          const next = Math.min(rows.length - 1, value + 1);
          virtualizer.scrollToIndex(next, { align: "auto" });
          return next;
        });
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlight((value) => {
          const next = Math.max(0, value - 1);
          virtualizer.scrollToIndex(next, { align: "auto" });
          return next;
        });
      } else if (event.key === "Enter" && highlight >= 0) {
        const row = rows[highlight];
        if (row) onOpen(row);
      } else if (event.key === "Escape") {
        setHighlight(-1);
      }
    },
    [rows, highlight, onOpen, virtualizer],
  );

  return (
    <div
      ref={scrollRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest('[role="row"], button, input, [role="columnheader"], [role="menuitem"]')) return;
        onBackgroundClick?.();
      }}
      className="relative min-h-0 flex-1 overflow-auto outline-none"
    >
      <div style={{ minWidth }}>
        <div
          role="row"
          className={cn(
            "sticky top-0 z-10 grid bg-theme-base",
            borders && "border-b border-theme-border",
          )}
          style={{ gridTemplateColumns: gridTemplate, height: 40 }}
        >
          {selectionMode ? (
            <div className={cn("flex items-center justify-center", borders && "border-r-subtle")}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => onToggleAll?.()}
                title="Select all visible rows"
                className="h-3.5 w-3.5 rounded border-theme-border accent-skyhook-500"
              />
            </div>
          ) : null}
          {columns.map((column, index) => {
            const active = sort?.key === column.key;
            const filterable = filterableKeys.has(column.key);
            return (
              <div
                key={column.key}
                role="columnheader"
                style={
                  stickyOffsets.has(column.key)
                    ? { position: "sticky", left: stickyOffsets.get(column.key), zIndex: 30 }
                    : undefined
                }
                className={cn(
                  "group/th relative flex min-w-0 items-center gap-1 text-[calc(12px*var(--font-scale))] font-medium uppercase tracking-wider text-theme-text-secondary",
                  column.compact ? "px-7" : "px-4",
                  stickyOffsets.has(column.key) && "bg-theme-base",
                  index !== columns.length - 1 && borders && "border-r-subtle",
                  column.align === "right" && "justify-end",
                  column.sortable !== false && "cursor-pointer select-none hover:text-theme-text-primary",
                )}
                onClick={() => column.sortable !== false && onSort(column.key)}
                title={column.tooltip ?? column.label}
              >
                <span className="truncate">{column.label}</span>
                {column.sortable !== false ? (
                  active ? (
                    sort?.direction === "asc" ? (
                      <ChevronUp className="h-3 w-3 shrink-0 text-accent-text" />
                    ) : (
                      <ChevronDown className="h-3 w-3 shrink-0 text-accent-text" />
                    )
                  ) : (
                    <ArrowUpDown className="h-2.5 w-2.5 shrink-0 opacity-0 transition-opacity group-hover/th:opacity-50" />
                  )
                ) : null}
                {filterable ? (
                  <button
                    type="button"
                    title={`Filter by ${column.label}`}
                    className="ml-auto shrink-0 rounded p-0.5 text-theme-text-tertiary opacity-0 transition-opacity hover:bg-theme-hover hover:text-theme-text-primary group-hover/th:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      onFilterColumn(column, event);
                    }}
                  >
                    <ListFilter className="h-3 w-3" />
                  </button>
                ) : null}
                <div
                  role="separator"
                  aria-orientation="vertical"
                  className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize"
                  title="Drag to resize · double-click to reset"
                  onClick={(event) => event.stopPropagation()}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    setPreviewWidths((current) => {
                      const next = { ...current };
                      delete next[column.key];
                      return next;
                    });
                    onResetColumnWidth(column.key);
                  }}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const startX = event.clientX;
                    // Snapshot every visible width on the first move. Without
                    // this the flexible Name column absorbs the change and the
                    // other tracks visibly slide while one column is dragged.
                    const snapshot: Record<string, number> = { ...effectiveWidths };
                    for (const entry of columns) {
                      if (snapshot[entry.key] === undefined) {
                        snapshot[entry.key] = entry.flex ? 240 : (entry.width ?? 140);
                      }
                    }
                    const startWidth = snapshot[column.key];
                    let finalWidth = startWidth;
                    let finalWidths = { ...snapshot };
                    let moved = false;
                    let frame: number | null = null;
                    const preview = () => {
                      frame = null;
                      setPreviewWidths(finalWidths);
                    };
                    const onMove = (moveEvent: PointerEvent) => {
                      finalWidth = Math.max(72, Math.round(startWidth + moveEvent.clientX - startX));
                      if (finalWidth === startWidth) return;
                      moved = true;
                      finalWidths = { ...snapshot, [column.key]: finalWidth };
                      if (frame === null) frame = window.requestAnimationFrame(preview);
                    };
                    const finish = () => {
                      window.removeEventListener("pointermove", onMove);
                      window.removeEventListener("pointerup", finish);
                      window.removeEventListener("pointercancel", finish);
                      if (frame !== null) {
                        window.cancelAnimationFrame(frame);
                        frame = null;
                      }
                      if (moved) onResizeEnd(column.key, finalWidth, finalWidths);
                      setPreviewWidths({});
                    };
                    setPreviewWidths(snapshot);
                    window.addEventListener("pointermove", onMove);
                    window.addEventListener("pointerup", finish);
                    window.addEventListener("pointercancel", finish);
                  }}
                >
                  <div className="mx-auto h-4 w-px bg-theme-border opacity-0 transition-opacity group-hover/th:opacity-100" />
                </div>
              </div>
            );
          })}
          <div
            className="sticky right-0 z-30 border-l-subtle bg-theme-base"
            aria-hidden
          />
        </div>

        {rows.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            {loading ? <Spinner label="Loading resources…" /> : emptyState}
          </div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const object = rows[virtualRow.index];
              const key = `${object.metadata?.uid ?? `${object.metadata?.namespace}/${object.metadata?.name}`}`;
              const selected =
                Boolean(selectedRef) &&
                selectedRef?.name === object.metadata?.name &&
                (selectedRef?.namespace ?? object.metadata?.namespace) === object.metadata?.namespace;
              return (
                <TableRow
                  key={key}
                  object={object}
                  columns={columns}
                  index={virtualRow.index}
                  top={virtualRow.start}
                  gridTemplate={gridTemplate}
                  stickyOffsets={stickyOffsets}
                  rowHeight={rowHeight}
                  borders={borders}
                  // A smooth top transition is a small-list nicety. On a 10k
                  // inventory the watch inserts rows continuously; animating
                  // every absolute row makes neighbouring rows cross while
                  // they move and can look like duplicated names.
                  animateTop={shiftRows && rows.length <= 1000}
                  selected={selected}
                  checked={selectedKeys.has(key)}
                  highlighted={virtualRow.index === highlight}
                  selectionMode={selectionMode}
                  hideRowMenu={hideRowMenu}
                  showNamespace={showNamespace}
                  podMetrics={podMetrics}
                  nodeMetrics={nodeMetrics}
                  claimPods={claimPods}
                  serviceEndpoints={serviceEndpoints}
                  warnings={warnings}
                  nodePodCounts={nodePodCounts}
                  onSelectNamespace={selectNamespace}
                  onOpenNode={openNode}
                  onOpenRef={openRef}
                  onOpen={openRow}
                  onContextMenu={contextRow}
                  onRowMenu={menuRow}
                  onToggleRow={toggleRow}
                  setHighlight={setHighlight}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

