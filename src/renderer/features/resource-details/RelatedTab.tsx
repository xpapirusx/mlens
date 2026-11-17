import { AlertTriangle, Network, Puzzle, Server } from "lucide-react";
import type { RelatedGroup } from "./useDetailsData";
import { getKindIcon } from "../../lib/icons";
import { cn } from "../../lib/cn";
import { toneClass, type Tone } from "../../lib/status";
import { Spinner } from "../../design-system/components/Spinner";
import { EmptyState } from "../../design-system/components/EmptyState";

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
  onNavigate: (kind: string, name: string, namespace?: string) => void;
}) {
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
      {groups.map((group) => (
        <div key={group.title}>
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-theme-text-tertiary">
              {group.title}
            </span>
            <span className="rounded bg-theme-elevated px-1 font-mono text-[10px] text-theme-text-tertiary">
              {group.items.length}
            </span>
          </div>
          <div className="overflow-hidden rounded-md border border-theme-border">
            {group.items.map((item, index) => {
              const Icon = getKindIcon(item.kind);
              return (                <button
                  key={`${item.kind}-${item.namespace}-${item.name}-${index}`}
                  type="button"
                  onClick={() => onNavigate(item.kind, item.name, item.namespace)}
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
      ))}
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
