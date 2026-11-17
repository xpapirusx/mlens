import { useMemo, useState } from "react";
import { AlertTriangle, Network, Puzzle, Server, X } from "lucide-react";
import type { RelatedGroup } from "./useDetailsData";
import { getKindIcon } from "../../lib/icons";
import { cn } from "../../lib/cn";
import { toneClass, type Tone } from "../../lib/status";
import { Spinner } from "../../design-system/components/Spinner";
import { EmptyState } from "../../design-system/components/EmptyState";
import { SearchInput } from "../../design-system/components/SearchInput";

function matchesQuery(query: string, regex: boolean, haystack: string[]): boolean {
  if (!query) return true;
  const text = haystack.join(" ");
  if (!regex) return text.toLowerCase().includes(query.toLowerCase());
  try {
    return new RegExp(query, "i").test(text);
  } catch {
    // An invalid pattern matches nothing rather than throwing on every row.
    return false;
  }
}

export function RelatedTab({
  groups,
  loading,
  error,
  warnings,
  onNavigate,
}: {
  groups: RelatedGroup[];
  loading: boolean;
  error: string | null;
  warnings?: string[];
  onNavigate: (kind: string, name: string, namespace?: string, apiVersion?: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [regex, setRegex] = useState(false);
  const [kinds, setKinds] = useState<string[]>([]);

  const regexError = useMemo(() => {
    if (!regex || !query) return false;
    try {
      new RegExp(query);
      return false;
    } catch {
      return true;
    }
  }, [query, regex]);

  const availableKinds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const group of groups) {
      for (const item of group.items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [groups]);

  const originalCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const group of groups) counts.set(group.title, group.items.length);
    return counts;
  }, [groups]);

  const visibleGroups = useMemo(() => {
    const selected = new Set(kinds);
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (selected.size > 0 && !selected.has(item.kind)) return false;
          return matchesQuery(query, regex, [
            item.kind,
            item.name,
            item.namespace ?? "",
            item.relationship,
            item.status?.text ?? "",
          ]);
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, kinds, query, regex]);

  const filteredCount = visibleGroups.reduce((total, group) => total + group.items.length, 0);
  const totalCount = groups.reduce((total, group) => total + group.items.length, 0);
  const hasFilters = Boolean(query) || kinds.length > 0;

  if (loading && groups.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner label="Resolving related resources…" />
      </div>
    );
  }
  if (error) {
    return <div className="p-4 text-sm text-red-600 dark:text-red-400">Cannot resolve related resources: {error}</div>;
  }

  const toolbar =
    totalCount > 0 ? (
      <div className="sticky top-0 z-10 -mx-3 -mt-3 border-b border-theme-border bg-theme-surface px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="w-64 min-w-32">
          <SearchInput
            value={query}
            onChange={setQuery}
            regex={regex}
            onRegexChange={setRegex}
            regexError={regexError}
            placeholder="Filter related…"
            size="sm"
            shortcut=""
          />
        </div>
        <span className="font-mono text-[10px] text-theme-text-tertiary">
          {filteredCount} / {totalCount}
        </span>
        {hasFilters ? (
          <button
            type="button"
            className="flex h-6 items-center gap-1 rounded border border-theme-border px-1.5 text-[10px] text-theme-text-secondary transition-colors hover:bg-theme-hover"
            onClick={() => {
              setQuery("");
              setRegex(false);
              setKinds([]);
            }}
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        ) : null}
      </div>
      {availableKinds.length > 1 ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {availableKinds.map(([kind, count]) => {
            const active = kinds.includes(kind);
            const Icon = getKindIcon(kind);
            return (
              <button
                key={kind}
                type="button"
                onClick={() =>
                  setKinds((current) =>
                    current.includes(kind) ? current.filter((entry) => entry !== kind) : [...current, kind],
                  )
                }
                className={cn(
                  "flex h-6 items-center gap-1 rounded-full border px-2 text-[10px] transition-colors",
                  active
                    ? "border-skyhook-500/50 bg-skyhook-500/10 text-accent-text"
                    : "border-theme-border bg-theme-elevated text-theme-text-secondary hover:bg-theme-hover",
                )}
                title={`${count} related ${kind}`}
              >
                <Icon className="h-3 w-3" />
                {kind}
                <span className="font-mono opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  ) : null;

  if (groups.length === 0) {
    return (
      <div>
        {warnings?.length ? (
          <div className="m-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
            <div className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="h-3 w-3" />
              Some relations could not be read (RBAC or API errors)
            </div>
            {warnings.map((warning) => (
              <div key={warning} className="mt-1 break-words font-mono text-[10px] opacity-80">
                {warning}
              </div>
            ))}
          </div>
        ) : null}
        <EmptyState
          icon={<Network />}
          title="No related resources"
          description="mLens checks owner references, label selectors, services, mounted configuration and pod-to-node relationships for this kind."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-3">
      {toolbar}
      {visibleGroups.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <div className="text-sm text-theme-text-secondary">No related resources match these filters.</div>
          <button
            type="button"
            className="text-xs text-accent-text hover:underline"
            onClick={() => {
              setQuery("");
              setRegex(false);
              setKinds([]);
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        visibleGroups.map((group) => (
          <div key={group.title}>
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-theme-text-tertiary">
                {group.title}
              </span>
              <span className="rounded bg-theme-elevated px-1 font-mono text-[10px] text-theme-text-tertiary">
                {group.items.length}
                {hasFilters && group.items.length !== (originalCounts.get(group.title) ?? 0)
                  ? ` / ${originalCounts.get(group.title) ?? 0}`
                  : ""}
              </span>
            </div>
            <div className="overflow-hidden rounded-md border border-theme-border">
              {group.items.map((item, index) => {
                const Icon = getKindIcon(item.kind);
                return (
                  <button
                    key={`${item.kind}-${item.namespace}-${item.name}-${index}`}
                    type="button"
                    onClick={() => onNavigate(item.kind, item.name, item.namespace, item.apiVersion)}
                    className={cn(
                      "flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors hover:bg-theme-hover/60",
                      index > 0 && "border-t border-theme-border-subtle",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-theme-text-tertiary" />
                    <span className="w-28 shrink-0 truncate text-[10px] text-theme-text-tertiary">{item.kind}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-theme-text-primary">
                      {item.name}
                    </span>
                    {item.namespace ? (
                      <span className="max-w-[8rem] truncate text-[10px] text-theme-text-disabled">{item.namespace}</span>
                    ) : null}
                    <span className="hidden w-32 truncate text-[10px] text-theme-text-tertiary lg:block">
                      {item.relationship}
                    </span>
                    {item.status ? (
                      <span className={cn("badge-sm", toneClass(item.status.tone as Tone))}>{item.status.text}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))
      )}
      {warnings?.length ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-700 dark:text-amber-300">
          Some relations could not be read: {warnings[0]}
        </div>
      ) : null}
      <div className="flex items-center gap-1.5 text-[10px] text-theme-text-disabled">
        <Puzzle className="h-3 w-3" />
        Relationships are computed from the live API, not inferred from static manifests.
      </div>
    </div>
  );
}

export function MetricsUnavailable({ reason }: { reason: string }) {
  return (
    <EmptyState
      icon={<Server />}
      title="Metrics are not available"
      description={reason}
    />
  );
}
