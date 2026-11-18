import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Tooltip } from "./Tooltip";

type Scheme = "utilization" | "count" | "quiet";

function barColor(percent: number, scheme: Scheme): string {
  // "count" is Radar's pod-count bar: neutral blue, amber only at the edge.
  if (scheme === "count") return percent > 90 ? "bg-amber-500" : "bg-sky-500";
  if (scheme === "quiet") return percent >= 90 ? "bg-amber-500" : "bg-emerald-400";
  if (percent > 85) return "bg-red-500";
  if (percent > 60) return "bg-amber-500";
  return "bg-emerald-500";
}

function markerColor(percent: number, scheme: Scheme): string {
  if (scheme === "quiet" && percent >= 95) return "bg-amber-500";
  return "bg-theme-text-primary/60";
}

/**
 * Radar-style resource bar. Default layout is **stacked**: the `used / total`
 * row (with the percentage on the right) sits above the track. "utilization"
 * may turn red against a real limit, "quiet" never does, and "count" is the
 * blue node-pod-count bar.
 */
export function ResourceBar({
  used,
  total,
  percent,
  scheme = "utilization",
  markerPercent,
  tooltip,
  showPercent = true,
  layout = "stacked",
}: {
  used: string;
  total: string;
  percent: number;
  scheme?: Scheme;
  markerPercent?: number;
  tooltip?: ReactNode;
  showPercent?: boolean;
  layout?: "stacked" | "inline";
}) {
  const clamped = Math.max(0, Math.min(100, percent));

  const track = (
    <div className="relative h-1.5 min-w-0 w-full rounded-full border border-theme-border bg-theme-elevated">
      <div
        className={cn("h-full rounded-full transition-[width] duration-300 ease-out", barColor(clamped, scheme))}
        style={{ width: `${clamped}%` }}
      />
      {markerPercent !== undefined && markerPercent > 0 && markerPercent <= 100 ? (
        <div
          className={cn("absolute -top-px h-[calc(100%+2px)] w-0.5", markerColor(markerPercent, scheme))}
          style={{ left: `${markerPercent}%` }}
        />
      ) : null}
    </div>
  );

  const numbers = (
    <div className="flex min-w-0 items-baseline justify-between gap-1">
      <span className="min-w-0 truncate font-mono text-[11px] text-theme-text-secondary">
        {used}
        <span className="text-theme-text-tertiary"> / {total}</span>
      </span>
      {showPercent ? (
        <span className="shrink-0 font-mono text-[10px] text-theme-text-tertiary">
          {Math.round(clamped)}%
        </span>
      ) : null}
    </div>
  );

  const body =
    layout === "inline" ? (
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 whitespace-nowrap font-mono text-[11px] text-theme-text-secondary">
          {used}
          <span className="text-theme-text-tertiary"> / {total}</span>
        </span>
        <div className="relative h-1.5 min-w-8 flex-1 rounded-full border border-theme-border bg-theme-elevated">
          <div
            className={cn("h-full rounded-full transition-[width] duration-300 ease-out", barColor(clamped, scheme))}
            style={{ width: `${clamped}%` }}
          />
          {markerPercent !== undefined && markerPercent > 0 && markerPercent <= 100 ? (
            <div
              className={cn("absolute -top-px h-[calc(100%+2px)] w-0.5", markerColor(markerPercent, scheme))}
              style={{ left: `${markerPercent}%` }}
            />
          ) : null}
        </div>
        {showPercent ? (
          <span className="w-8 shrink-0 text-right font-mono text-[10px] text-theme-text-tertiary">
            {Math.round(clamped)}%
          </span>
        ) : null}
      </div>
    ) : (
      <div className="flex min-w-0 flex-col gap-0.5">
        {numbers}
        {track}
      </div>
    );

  if (!tooltip) return body;
  return (
    <Tooltip content={tooltip} wrapperClassName="w-full min-w-0" delay={200}>
      {body}
    </Tooltip>
  );
}
