import { useMemo, useState } from "react";
import type { ApiResourceInfo } from "@shared/types";
import { Pin, SlidersHorizontal } from "lucide-react";
import {
  catalogGroupKey,
  catalogKindKey,
  type ResourceGroup,
} from "../../lib/catalog";
import { getKindIcon, kindLabel } from "../../lib/icons";
import { useCatalogStore } from "../../stores/catalog-store";
import { Modal } from "../../design-system/components/Modal";
import { Button } from "../../design-system/components/Button";
import { SearchInput } from "../../design-system/components/SearchInput";
import { cn } from "../../lib/cn";

type Row =
  | { kind: "group"; key: string; label: string; level: number; groupId: string; icon: React.ReactNode }
  | { kind: "resource"; key: string; label: string; level: number; icon: React.ReactNode };

function resourceRow(resource: ApiResourceInfo, level: number): Row {
  const Icon = getKindIcon(resource.kind, resource.group);
  return {
    kind: "resource",
    key: catalogKindKey(resource),
    label: resource.isCrd ? resource.kind : kindLabel(resource.kind, resource.plural),
    level,
    icon: <Icon className="h-3.5 w-3.5" />,
  };
}

function buildRows(groups: ResourceGroup[]): Row[] {
  const rows: Row[] = [];
  for (const group of groups) {
    const GroupIcon = group.icon;
    rows.push({
      kind: "group",
      key: catalogGroupKey(group.id),
      label: group.title,
      level: 0,
      groupId: group.id,
      icon: <GroupIcon className="h-3.5 w-3.5" />,
    });
    for (const resource of group.resources) rows.push(resourceRow(resource, 1));
    for (const child of group.children ?? []) {
      const ChildIcon = child.icon;
      rows.push({
        kind: "group",
        key: catalogGroupKey(child.id),
        label: child.title,
        level: 1,
        groupId: child.id,
        icon: <ChildIcon className="h-3.5 w-3.5" />,
      });
      for (const resource of child.resources) rows.push(resourceRow(resource, 2));
    }
  }
  return rows;
}

/**
 * "Choose columns" for the resource catalog: untick a kind or a whole group to
 * hide it, pin a group to keep it at the top, and reset accidental moves.
 */
export function CatalogCustomizeDialog({
  open,
  onClose,
  groups,
}: {
  open: boolean;
  onClose: () => void;
  groups: ResourceGroup[];
}) {
  const settings = useCatalogStore((state) => state.settings);
  const updateSettings = useCatalogStore((state) => state.updateSettings);
  const [search, setSearch] = useState("");

  const hidden = settings?.hiddenCatalogItems ?? [];
  const pinned = settings?.pinnedCatalogGroups ?? [];
  const rows = useMemo(() => buildRows(groups), [groups]);
  const term = search.trim().toLowerCase();
  const visible = term ? rows.filter((row) => row.label.toLowerCase().includes(term)) : rows;

  const toggleHidden = (key: string) => {
    void updateSettings({
      hiddenCatalogItems: hidden.includes(key)
        ? hidden.filter((entry) => entry !== key)
        : [...hidden, key],
    });
  };

  const togglePin = (groupId: string) => {
    void updateSettings({
      pinnedCatalogGroups: pinned.includes(groupId)
        ? pinned.filter((entry) => entry !== groupId)
        : [...pinned, groupId],
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={560}
      title="Customize catalog"
      subtitle="Untick to hide a kind or group. Pinned groups stay at the top of the sidebar."
      footer={
        <div className="flex w-full items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={hidden.length === 0}
            onClick={() => void updateSettings({ hiddenCatalogItems: [] })}
          >
            Show all
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={Object.keys(settings?.catalogMoves ?? {}).length === 0}
            onClick={() => void updateSettings({ catalogMoves: {} })}
          >
            Reset moves
          </Button>
          <Button variant="secondary" size="sm" className="ml-auto" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Filter kinds and groups…"
        size="md"
      />
      <div className="mt-2 max-h-[52vh] overflow-y-auto rounded-md border border-theme-border">
        {visible.map((row) => {
          const checked = !hidden.includes(row.key);
          const isTopGroup = row.kind === "group" && row.level === 0;
          return (
            <div
              key={row.key}
              className="flex items-center gap-2 border-b border-theme-border-subtle px-2 py-1.5 last:border-0 hover:bg-theme-hover/50"
              style={{ paddingLeft: 8 + row.level * 18 }}
            >
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-[calc(12px*var(--font-scale))] text-theme-text-secondary">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleHidden(row.key)}
                  className="h-3.5 w-3.5 shrink-0 rounded border-theme-border accent-skyhook-500"
                />
                <span className={cn("shrink-0", checked ? "text-theme-text-tertiary" : "text-theme-text-disabled")}>
                  {row.icon}
                </span>
                <span className={cn("truncate", row.kind === "group" && "font-medium text-theme-text-primary")}>
                  {row.label}
                </span>
              </label>
              {isTopGroup ? (
                <button
                  type="button"
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded text-theme-text-tertiary hover:bg-theme-hover hover:text-theme-text-primary",
                    pinned.includes(row.groupId) && "text-amber-500",
                  )}
                  title={pinned.includes(row.groupId) ? "Unpin group" : "Pin group to the top"}
                  onClick={() => togglePin(row.groupId)}
                >
                  <Pin className={cn("h-3.5 w-3.5", pinned.includes(row.groupId) && "fill-current")} />
                </button>
              ) : null}
            </div>
          );
        })}
        {visible.length === 0 ? (
          <div className="px-3 py-6 text-center text-[calc(11px*var(--font-scale))] text-theme-text-tertiary">
            Nothing matches “{search}”.
          </div>
        ) : null}
      </div>
      <p className="mt-2 flex items-start gap-1.5 text-[calc(10px*var(--font-scale))] leading-relaxed text-theme-text-tertiary">
        <SlidersHorizontal className="mt-0.5 h-3 w-3 shrink-0" />
        Drag a kind or a CRD folder onto a group header in the sidebar to move it
        there (for example Istio CRDs into Network).
      </p>
    </Modal>
  );
}
