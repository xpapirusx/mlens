import { useCallback, useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowUpDown, ChevronDown, ChevronUp, ListFilter } from "lucide-react";
import type { KubeObject } from "@shared/types";
import type { ColumnDef } from "../../lib/columns";
import { formatColumnWidth } from "../../lib/columns";
import { cn } from "../../lib/cn";
import { Spinner } from "../../design-system/components/Spinner";

const ROW_HEIGHT = 44;

interface ResourceTableProps {
  rows: KubeObject[];
  columns: ColumnDef[];
  showNamespace: boolean;
  sort: { key: string; direction: "asc" | "desc" } | null;
  onSort: (key: string) => void;
  selectedRef?: { namespace?: string; name: string } | null;
  onOpen: (object: KubeObject) => void;
  onContextMenu: (object: KubeObject, event: React.MouseEvent) => void;
  onFilterColumn: (column: ColumnDef) => void;
  filterableKeys: Set<string>;
  loading: boolean;
  emptyState?: React.ReactNode;
}

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
  filterableKeys,
  loading,
  emptyState,
}: ResourceTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [highlight, setHighlight] = useState(-1);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 16,
  });

  useEffect(() => {
    setHighlight((value) => (value >= rows.length ? -1 : value));
  }, [rows.length]);

  useEffect(() => {
    setHighlight(-1);
  }, [columns]);

  const gridTemplate = columns.map((column) => formatColumnWidth(column)).join(" ");
  const minWidth = columns.reduce((sum, column) => sum + (column.flex ? 240 : (column.width ?? 140)), 0);

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
      className="relative min-h-0 flex-1 overflow-auto outline-none"
    >
      <div style={{ minWidth }}>
        <div
          role="row"
          className="sticky top-0 z-10 grid border-b border-theme-border bg-theme-base"
          style={{ gridTemplateColumns: gridTemplate, height: 40 }}
        >
          {columns.map((column, index) => {
            const active = sort?.key === column.key;
            const filterable = filterableKeys.has(column.key);
            return (
              <div
                key={column.key}
                role="columnheader"
                className={cn(
                  "group/th relative flex min-w-0 items-center gap-1 px-4 text-[11px] font-medium uppercase tracking-wide text-theme-text-secondary",
                  index !== columns.length - 1 && "border-r-subtle",
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
                      onFilterColumn(column);
                    }}
                  >
                    <ListFilter className="h-3 w-3" />
                  </button>
                ) : null}
              </div>
            );
          })}
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
                <div
                  key={key}
                  role="row"
                  aria-selected={selected}
                  data-index={virtualRow.index}
                  className={cn(
                    "group/row absolute left-0 top-0 grid w-full cursor-pointer border-b-subtle transition-colors",
                    selected
                      ? "selection-strong"
                      : virtualRow.index === highlight
                        ? "selection selection-ring"
                        : "hover:bg-theme-hover/40",
                  )}
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                    height: ROW_HEIGHT,
                    gridTemplateColumns: gridTemplate,
                  }}
                  onClick={() => {
                    setHighlight(virtualRow.index);
                    onOpen(object);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setHighlight(virtualRow.index);
                    onContextMenu(object, event);
                  }}
                >
                  {columns.map((column, index) => (
                    <div
                      key={column.key}
                      role="cell"
                      className={cn(
                        "flex min-w-0 items-center overflow-hidden px-4",
                        index !== columns.length - 1 && "border-r-subtle",
                        column.align === "right" && "justify-end",
                      )}
                    >
                      <div className="min-w-0 w-full">{column.cell(object, { showNamespace })}</div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export { ROW_HEIGHT };
