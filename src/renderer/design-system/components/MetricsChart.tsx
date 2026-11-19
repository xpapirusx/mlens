import { useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import type { MetricsDataPoint } from "@shared/types";
import { cn } from "../../lib/cn";

/**
 * Radar's mini metrics chart: a compact area sparkline over the samples mLens
 * collected from metrics.k8s.io, with request/limit reference lines, a hover
 * crosshair and the axis labels the design system uses (10px, not italic, no
 * chart library). The chart owns no data — callers pass the samples.
 */

type Metric = "cpu" | "memory";

function niceRoundUp(value: number): number {
  if (value <= 0) return 0;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  // Finer than the classic 1/2/5/10 ladder: a 500m limit should not push the
  // axis to 1000m and draw the limit mid-chart.
  const rungs = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const nice = rungs.find((rung) => normalized <= rung) ?? 10;
  return nice * magnitude;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function spanLabel(milliseconds: number): string {
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 60) return `${Math.max(1, seconds)}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function useElementWidth(): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

export interface MetricsChartProps {
  points: MetricsDataPoint[];
  metric: Metric;
  /** Chart body height in px, excluding the axis row. */
  height?: number;
  /** Summed request of the shown containers, in the metric's unit. */
  request?: number;
  /** Summed limit of the shown containers, in the metric's unit. */
  limit?: number;
  /** Value formatter for the axis, the tooltip and the "current" row. */
  format: (value: number) => string;
  emptyLabel?: string;
  className?: string;
}

export function MetricsChart({
  points,
  metric,
  height = 72,
  request,
  limit,
  format,
  emptyLabel = "No samples yet",
  className,
}: MetricsChartProps) {
  const [containerRef, width] = useElementWidth();
  const gradientId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [hover, setHover] = useState<number | null>(null);

  const axisWidth = 48;
  const padTop = 6;
  const padBottom = 4;
  const padRight = 8;
  const plotWidth = Math.max(0, width - axisWidth - padRight);
  const plotHeight = Math.max(1, height - padTop - padBottom);

  const data = useMemo(() => {
    const sorted = [...points].sort((left, right) => left.timestamp - right.timestamp);
    const values = sorted.map((point) => (metric === "cpu" ? point.cpu : point.memory));
    const dataMax = values.reduce((max, value) => Math.max(max, value), 0);
    const domainMax = niceRoundUp(Math.max(dataMax, limit ?? 0) * 1.05) || 1;
    const first = sorted[0]?.timestamp ?? 0;
    const last = sorted[sorted.length - 1]?.timestamp ?? 0;
    const step = median(
      sorted.slice(1).map((point, index) => point.timestamp - (sorted[index]?.timestamp ?? point.timestamp)),
    );
    const gapThreshold = step > 0 ? step * 2.5 : Number.POSITIVE_INFINITY;
    return { sorted, values, domainMax, first, last, gapThreshold };
  }, [points, metric, limit]);

  const scaleX = (timestamp: number): number => {
    if (data.sorted.length < 2 || data.last === data.first) return plotWidth;
    return ((timestamp - data.first) / (data.last - data.first)) * plotWidth;
  };
  const scaleY = (value: number): number =>
    padTop + plotHeight - Math.max(0, Math.min(1, value / data.domainMax)) * plotHeight;

  // Split into segments so a collection gap is a gap, not a straight line
  // through time where nothing was measured.
  const segments = useMemo(() => {
    const result: Array<Array<{ x: number; y: number; timestamp: number; value: number }>> = [];
    let current: Array<{ x: number; y: number; timestamp: number; value: number }> = [];
    data.sorted.forEach((point, index) => {
      const previous = data.sorted[index - 1];
      if (previous && point.timestamp - previous.timestamp > data.gapThreshold) {
        if (current.length) result.push(current);
        current = [];
      }
      current.push({
        x: scaleX(point.timestamp),
        y: scaleY(data.values[index] ?? 0),
        timestamp: point.timestamp,
        value: data.values[index] ?? 0,
      });
    });
    if (current.length) result.push(current);
    return result;
    // scaleX/scaleY close over `data` and the plot size; those are the deps.
  }, [data, plotWidth, plotHeight]);

  const line = (pointsInSegment: Array<{ x: number; y: number }>): string =>
    pointsInSegment.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const area = (pointsInSegment: Array<{ x: number; y: number }>): string => {
    if (pointsInSegment.length === 0) return "";
    const baseline = padTop + plotHeight;
    const first = pointsInSegment[0];
    const last = pointsInSegment[pointsInSegment.length - 1];
    if (!first || !last) return "";
    return `M${first.x.toFixed(2)},${baseline} ${line(pointsInSegment)} L${last.x.toFixed(2)},${baseline} Z`;
  };

  const color = metric === "cpu" ? "var(--chart-cpu)" : "var(--chart-memory)";
  const requestY = request && request > 0 ? scaleY(request) : undefined;
  const limitY = limit && limit > 0 ? scaleY(limit) : undefined;
  const current = data.sorted[data.sorted.length - 1];
  const currentValue = data.values[data.values.length - 1] ?? 0;
  const flatPoints = segments.flat();
  const hoveredPoint = hover !== null ? flatPoints[hover] : undefined;
  const hasPoints = data.sorted.length > 0;

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex" style={{ height }}>
        <div
          className="flex shrink-0 flex-col justify-between whitespace-nowrap pr-1 text-right font-mono text-[calc(9px*var(--font-scale))] leading-none text-theme-text-tertiary"
          style={{ width: axisWidth, paddingTop: padTop, paddingBottom: padBottom }}
        >
          <span>{hasPoints ? format(data.domainMax) : ""}</span>
          <span>{hasPoints ? format(data.domainMax / 2) : ""}</span>
          <span>{hasPoints ? "0" : ""}</span>
        </div>

        <div ref={containerRef} className="relative min-w-0 flex-1">
          {!hasPoints ? (
            <div className="flex h-full items-center text-[calc(10px*var(--font-scale))] text-theme-text-disabled">
              {emptyLabel}
            </div>
          ) : width > 0 ? (
            <svg
              width={plotWidth}
              height={height}
              className="block overflow-visible"
              role="img"
              aria-label={`${metric === "cpu" ? "CPU" : "Memory"} usage, ${data.sorted.length} samples`}
              onPointerLeave={() => setHover(null)}
              onPointerMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const x = event.clientX - rect.left;
                let nearest = 0;
                let distance = Number.POSITIVE_INFINITY;
                flatPoints.forEach((point, index) => {
                  const next = Math.abs(point.x - x);
                  if (next < distance) {
                    distance = next;
                    nearest = index;
                  }
                });
                setHover(flatPoints.length ? nearest : null);
              }}
            >
              <defs>
                <linearGradient id={`metrics-fill-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity="0.28" />
                  <stop offset="100%" stopColor={color} stopOpacity="0.03" />
                </linearGradient>
              </defs>

              {/* Invisible hit area: an SVG only receives pointer events on
                  painted geometry, so the crosshair would miss empty space. */}
              <rect width={plotWidth} height={height} fill="transparent" pointerEvents="all" />

              {/* Radar's three grid lines: top, middle, baseline. */}
              {[0, 0.5, 1].map((fraction) => (
                <line
                  key={fraction}
                  x1={0}
                  x2={plotWidth}
                  y1={padTop + plotHeight * fraction}
                  y2={padTop + plotHeight * fraction}
                  stroke="var(--border-subtle)"
                  strokeWidth={1}
                />
              ))}

              {requestY !== undefined ? (
                <line
                  x1={0}
                  x2={plotWidth}
                  y1={requestY}
                  y2={requestY}
                  stroke="var(--color-warning)"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.7}
                />
              ) : null}
              {limitY !== undefined ? (
                <line
                  x1={0}
                  x2={plotWidth}
                  y1={limitY}
                  y2={limitY}
                  stroke="var(--color-error)"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.75}
                />
              ) : null}

              {segments.map((segment, index) => (
                <g key={index}>
                  {segment.length > 1 ? (
                    <path d={area(segment)} fill={`url(#metrics-fill-${gradientId})`} stroke="none" />
                  ) : null}
                  <path
                    d={line(segment)}
                    fill="none"
                    stroke={color}
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              ))}

              {current ? (
                <circle cx={scaleX(current.timestamp)} cy={scaleY(currentValue)} r={2.5} fill={color} />
              ) : null}

              {hoveredPoint ? (
                <g pointerEvents="none">
                  <line
                    x1={hoveredPoint.x}
                    x2={hoveredPoint.x}
                    y1={padTop}
                    y2={padTop + plotHeight}
                    stroke="var(--border-emphasis)"
                    strokeWidth={1}
                    strokeDasharray="2 2"
                  />
                  <circle cx={hoveredPoint.x} cy={hoveredPoint.y} r={3} fill={color} />
                </g>
              ) : null}
            </svg>
          ) : null}

          {hoveredPoint ? (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded border border-theme-border bg-theme-elevated px-1.5 py-0.5 font-mono text-[calc(9px*var(--font-scale))] text-theme-text-primary shadow-theme-sm"
              style={{
                left: Math.min(Math.max(hoveredPoint.x, 44), Math.max(44, plotWidth - 44)),
                top: 0,
              }}
            >
              {format(hoveredPoint.value)}
              <span className="ml-1 text-theme-text-tertiary">
                {new Date(hoveredPoint.timestamp).toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <div
        className="mt-1 flex items-center justify-between text-[calc(9px*var(--font-scale))] text-theme-text-disabled"
        style={{ paddingLeft: axisWidth }}
      >
        <span>{data.sorted.length > 1 ? spanLabel(data.last - data.first) : ""}</span>
        <span>{data.sorted.length > 1 ? "now" : ""}</span>
      </div>
    </div>
  );
}
