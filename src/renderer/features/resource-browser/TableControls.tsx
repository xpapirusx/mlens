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
  value: string;
  onChange: (namespace: string) => void;
  showSystemNamespaces: boolean;
  onShowSystemNamespacesChange: (show: boolean) => void;
}) {
  const [search, setSearch] = useState("");

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return namespaces
      .filter((namespace) => showSystemNamespaces || !namespace.startsWith("kube-"))
      .filter((namespace) => !term || namespace.toLowerCase().includes(term))
      .sort((a, b) => a.localeCompare(b));
  }, [namespaces, search, showSystemNamespaces]);

  return (
    <Menu
      width={250}
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className={cn(
            "flex h-8 max-w-[13rem] items-center gap-1.5 rounded-lg border border-theme-border bg-theme-elevated px-2.5 text-xs font-medium text-theme-text-primary transition-colors hover:bg-theme-hover",
            open && "ring-1 ring-skyhook-500/50",
            value !== "all" && "border-skyhook-500/40 text-accent-text",
          )}
          title="Namespace scope"
        >
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-theme-text-tertiary" />
          <span className="truncate">{value === "all" ? "All namespaces" : value}</span>
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
          <MenuItemRow
            active={value === "all"}
            onClick={() => {
              onChange("all");
              close();
            }}
          >
            All namespaces
          </MenuItemRow>
          <div className="max-h-72 overflow-y-auto">
            {visible.map((namespace) => (
              <MenuItemRow
                key={namespace}
                active={value === namespace}
                onClick={() => {
                  onChange(namespace);
                  close();
                }}
              >
                {namespace}
              </MenuItemRow>
            ))}
            {visible.length === 0 ? (
              <div className="px-2 py-2 text-xs text-theme-text-disabled">No namespaces</div>
            ) : null}
          </div>
          <div className="mt-1 border-t border-theme-border pt-1">
            <MenuItemRow
              active={showSystemNamespaces}
              onClick={() => onShowSystemNamespacesChange(!showSystemNamespaces)}
            >
              Show system namespaces
            </MenuItemRow>
          </div>
        </>
      )}
    </Menu>
  );
}

function MenuItemRow({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs",
        active ? "selection selection-text" : "text-theme-text-secondary hover:bg-theme-elevated hover:text-theme-text-primary",
      )}
    >
      <span className="min-w-0 flex-1 truncate font-mono">{children}</span>
      {active ? <Check className="h-3 w-3 shrink-0" /> : null}
    </button>
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
