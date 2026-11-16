import { useMemo, useState } from "react";
import { Check, ChevronDown, Columns3, FolderOpen, Search } from "lucide-react";
import { Menu, MenuLabel } from "../../design-system/components/Menu";
import { cn } from "../../lib/cn";
import type { ColumnDef } from "../../lib/columns";

export function NamespacePicker({
  namespaces,
  value,
  onChange,
  showSystemNamespaces,
  onShowSystemNamespacesChange,
}: {
  namespaces: string[];
  value: string[];
  onChange: (namespaces: string[]) => void;
  showSystemNamespaces: boolean;
  onShowSystemNamespacesChange: (show: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const selected = new Set(value);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return namespaces
      .filter((namespace) => showSystemNamespaces || !namespace.startsWith("kube-"))
      .filter((namespace) => !term || namespace.toLowerCase().includes(term))
      .sort((a, b) => a.localeCompare(b));
  }, [namespaces, search, showSystemNamespaces]);

  const label =
    value.length === 0
      ? "All namespaces"
      : value.length === 1
        ? value[0]
        : `${value.length} namespaces`;

  return (
    <Menu
      width={280}
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className={cn(
            "flex h-8 max-w-[14rem] items-center gap-1.5 rounded-lg border border-theme-border bg-theme-elevated px-2.5 text-xs font-medium text-theme-text-primary transition-colors hover:bg-theme-hover",
            open && "ring-1 ring-skyhook-500/50",
            value.length > 0 && "border-skyhook-500/40 text-accent-text",
          )}
          title="Namespace scope"
        >
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-theme-text-tertiary" />
          <span className="truncate">{label}</span>
          <ChevronDown className="ml-auto h-3 w-3 shrink-0 text-theme-text-tertiary" />
        </button>
      )}
    >
      {({ close }) => (
        <>
          <div className="relative p-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-theme-text-tertiary" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter namespaces…"
              autoFocus
              className="h-7 w-full rounded-md border border-theme-border bg-theme-elevated pl-8 pr-2 text-xs text-theme-text-primary focus:outline-none focus:ring-1 focus:ring-skyhook-500/60"
            />
          </div>
          <button
            type="button"
            onClick={() => onChange([])}
            className={cn(
              "flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs",
              value.length === 0
                ? "selection selection-text"
                : "text-theme-text-secondary hover:bg-theme-elevated hover:text-theme-text-primary",
            )}
          >
            <span className="min-w-0 flex-1 truncate font-mono">All namespaces</span>
            {value.length === 0 ? <Check className="h-3 w-3 shrink-0" /> : null}
          </button>
          <div className="max-h-72 overflow-y-auto">
            {visible.map((namespace) => {
              const active = selected.has(namespace);
              return (
                <button
                  key={namespace}
                  type="button"
                  onClick={() =>
                    onChange(
                      active
                        ? value.filter((entry) => entry !== namespace)
                        : [...value, namespace],
                    )
                  }
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs",
                    active
                      ? "selection selection-text"
                      : "text-theme-text-secondary hover:bg-theme-elevated hover:text-theme-text-primary",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    readOnly
                    className="h-3 w-3 rounded border-theme-border accent-skyhook-500"
                  />
                  <span className="min-w-0 flex-1 truncate font-mono">{namespace}</span>
                </button>
              );
            })}
            {visible.length === 0 ? (
              <div className="px-2 py-2 text-xs text-theme-text-disabled">No namespaces</div>
            ) : null}
          </div>
          <div className="mt-1 flex items-center justify-between border-t border-theme-border pt-1">
            <button
              type="button"
              className="rounded px-2 py-1 text-[11px] text-theme-text-tertiary hover:text-theme-text-primary"
              onClick={() => onShowSystemNamespacesChange(!showSystemNamespaces)}
            >
              {showSystemNamespaces ? "Hide system namespaces" : "Show system namespaces"}
            </button>
            <button
              type="button"
              className="rounded px-2 py-1 text-[11px] font-medium text-accent-text hover:underline"
              onClick={close}
            >
              Done
            </button>
          </div>
        </>
      )}
    </Menu>
  );
}

export function ColumnPicker({
  columns,
  hidden,
  onChange,
}: {
  columns: ColumnDef[];
  hidden: Set<string>;
  onChange: (hidden: string[]) => void;
}) {
  return (
    <Menu
      width={240}
      align="end"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className={cn("shell-icon-button", open && "bg-theme-hover text-theme-text-primary")}
          title="Choose columns"
        >
          <Columns3 className="h-4 w-4" />
        </button>
      )}
    >
      {({ close }) => (
        <>
          <div className="flex items-center justify-between px-2 py-1">
            <MenuLabel>Columns</MenuLabel>
            <button
              type="button"
              className="text-[10px] text-theme-text-tertiary hover:text-theme-text-primary"
              onClick={() => onChange([])}
            >
              Reset
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {columns.map((column) => {
              const disabled = column.key === "name";
              const checked = !hidden.has(column.key);
              return (
                <button
                  key={column.key}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    const next = new Set(hidden);
                    if (checked) next.add(column.key);
                    else next.delete(column.key);
                    onChange([...next]);
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-theme-text-secondary hover:bg-theme-elevated hover:text-theme-text-primary disabled:opacity-50"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    readOnly
                    className="h-3 w-3 rounded border-theme-border accent-skyhook-500"
                  />
                  <span className="min-w-0 flex-1 truncate">{column.label}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-1 border-t border-theme-border pt-1">
            <button
              type="button"
              className="w-full rounded px-2 py-1.5 text-left text-[11px] text-theme-text-tertiary hover:bg-theme-elevated hover:text-theme-text-primary"
              onClick={close}
            >
              Close
            </button>
          </div>
        </>
      )}
    </Menu>
  );
}
