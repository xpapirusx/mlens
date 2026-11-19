import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import type { KubeObject } from "@shared/types";
import type { CellContext, ColumnDef } from "../../lib/columns";
import { cn } from "../../lib/cn";

export interface FilterOption {
  value: string;
  count: number;
}

export function buildFilterOptions(rows: KubeObject[], column: ColumnDef, context?: CellContext): FilterOption[] {
  if (!column.filterValue) return [];
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = column.filterValue(row, context);
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export function FilterPopover({
  x,
  y,
  column,
  options,
  selected,
  onChange,
  onClose,
}: {
  x: number;
  y: number;
  column: ColumnDef;
  options: FilterOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState({ left: x, top: y });

  useEffect(() => {
    const height = panelRef.current?.offsetHeight ?? 320;
    const width = 260;
    setPosition({
      left: Math.min(x, window.innerWidth - width - 12),
      top: Math.min(y, window.innerHeight - height - 12),
    });
  }, [x, y]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const term = search.toLowerCase();
    return options.filter((option) => option.value.toLowerCase().includes(term));
  }, [options, search]);

  const toggle = (value: string) => {
    if (selected.includes(value)) onChange(selected.filter((entry) => entry !== value));
    else onChange([...selected, value]);
  };

  return createPortal(
    <div
      ref={panelRef}
      className="menu-surface fixed z-[93] flex max-h-[420px] w-[260px] flex-col p-1"
      style={{ left: position.left, top: position.top }}
    >
      <div className="flex items-center justify-between border-b border-theme-border px-2 py-1.5">
        <span className="text-[calc(10px*var(--font-scale))] font-semibold uppercase tracking-wider text-theme-text-tertiary">
          {column.label}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-theme-text-tertiary hover:bg-theme-hover hover:text-theme-text-primary"
          aria-label="Close filter"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {options.length > 8 ? (
        <div className="relative border-b border-theme-border px-1 py-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-theme-text-tertiary" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            autoFocus
            placeholder="Filter values…"
            className="h-6 w-full rounded border border-theme-border bg-theme-elevated pl-7 pr-2 text-xs text-theme-text-primary focus:outline-none focus:ring-1 focus:ring-skyhook-500/60"
          />
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto py-0.5">
        {filtered.map((option) => {
          const checked = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => toggle(option.value)}
              className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-theme-elevated"
            >
              <input
                type="checkbox"
                checked={checked}
                readOnly
                className="h-3 w-3 rounded border-theme-border accent-skyhook-500"
              />
              <span className={cn("min-w-0 flex-1 truncate", checked ? "text-theme-text-primary" : "text-theme-text-secondary")}>
                {option.value}
              </span>
              <span className="font-mono text-[calc(10px*var(--font-scale))] text-theme-text-disabled">{option.count}</span>
            </button>
          );
        })}
        {filtered.length === 0 ? (
          <div className="px-2 py-2 text-xs text-theme-text-disabled">No matches</div>
        ) : null}
      </div>

      <div className="flex items-center justify-between border-t border-theme-border px-2 py-1.5">
        <button
          type="button"
          className="text-[calc(11px*var(--font-scale))] text-theme-text-tertiary hover:text-theme-text-primary"
          onClick={() => onChange([])}
        >
          Clear
        </button>
        <button
          type="button"
          className="text-[calc(11px*var(--font-scale))] font-medium text-accent-text hover:underline"
          onClick={onClose}
        >
          Done
        </button>
      </div>
    </div>,
    document.body,
  );
}
