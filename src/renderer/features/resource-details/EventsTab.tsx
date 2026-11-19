import { useMemo, useState } from "react";
import type { KubeObject } from "@shared/types";
import { cn } from "../../lib/cn";
import { formatRelativeTime, formatTimestamp } from "../../lib/format";
import { Spinner } from "../../design-system/components/Spinner";
import { EmptyState } from "../../design-system/components/EmptyState";
import { AlertTriangle, Info } from "lucide-react";

export function EventsTab({
  events,
  loading,
  error,
}: {
  events: KubeObject[];
  loading: boolean;
  error: string | null;
}) {
  const [warningsOnly, setWarningsOnly] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    return events.filter((event) => {
      const typed = event as any;
      if (warningsOnly && typed.type !== "Warning") return false;
      const term = query.trim().toLowerCase();
      if (!term) return true;
      return `${typed.reason} ${typed.message} ${typed.source?.component}`.toLowerCase().includes(term);
    });
  }, [events, warningsOnly, query]);

  if (loading && events.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner label="Loading events…" />
      </div>
    );
  }

  if (error) {
    return <div className="p-4 text-sm text-red-600 dark:text-red-400">Cannot load events: {error}</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-theme-border bg-theme-base px-3">
        <label className="flex cursor-pointer items-center gap-1.5 text-[calc(11px*var(--font-scale))] text-theme-text-secondary">
          <input
            type="checkbox"
            checked={warningsOnly}
            onChange={(event) => setWarningsOnly(event.target.checked)}
            className="h-3 w-3 rounded border-theme-border accent-skyhook-500"
          />
          Warnings only
        </label>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter events…"
          className="ml-auto h-6 w-56 rounded border border-theme-border bg-theme-elevated px-2 text-[calc(11px*var(--font-scale))] text-theme-text-primary placeholder:text-theme-text-tertiary focus:outline-none focus:ring-1 focus:ring-skyhook-500/60"
        />
        <span className="font-mono text-[calc(10px*var(--font-scale))] text-theme-text-tertiary">{filtered.length}</span>
      </div>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Info />}
            title="No events"
            description="Kubernetes events are retained for about an hour by default. Nothing matched this resource."
          />
        ) : (
          filtered.map((event, index) => {
            const typed = event as any;
            const warning = typed.type === "Warning";
            return (
              <div
                key={`${typed.metadata?.uid ?? index}`}
                className={cn(
                  "rounded-md border-l-2 px-2.5 py-2",
                  warning
                    ? "border-red-500 bg-red-500/10"
                    : "border-skyhook-500/60 bg-theme-elevated/40",
                )}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  {warning ? (
                    <AlertTriangle className="h-3 w-3 text-red-500" />
                  ) : (
                    <Info className="h-3 w-3 text-skyhook-400" />
                  )}
                  <span className="text-[calc(12px*var(--font-scale))] font-medium text-theme-text-primary">{typed.reason}</span>
                  <span className="text-[calc(10px*var(--font-scale))] text-theme-text-tertiary">
                    {typed.source?.component}
                    {typed.source?.host ? ` · ${typed.source.host}` : ""}
                  </span>
                  {typed.count > 1 ? (
                    <span className="badge-sm status-unknown">×{typed.count}</span>
                  ) : null}
                  <span
                    className="ml-auto text-[calc(10px*var(--font-scale))] text-theme-text-disabled"
                    title={formatTimestamp(typed.lastTimestamp ?? typed.eventTime)}
                  >
                    {formatRelativeTime(typed.lastTimestamp ?? typed.eventTime)}
                  </span>
                </div>
                <div className="mt-1 whitespace-pre-wrap break-words text-[calc(11px*var(--font-scale))] leading-relaxed text-theme-text-secondary">
                  {typed.message}
                </div>
                <div className="mt-1 font-mono text-[calc(10px*var(--font-scale))] text-theme-text-disabled">
                  {typed.involvedObject?.kind}/{typed.involvedObject?.name}
                  {typed.metadata?.namespace ? ` · ${typed.metadata.namespace}` : ""}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
