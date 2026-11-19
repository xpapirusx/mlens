import type { ReactNode } from "react";
import { ChartColumn, Cpu, Database } from "lucide-react";
import type { ApiResourceInfo, KubeObject, MetricsDataPoint, MetricsSeries } from "@shared/types";
import { formatCpuMilli, formatMemoryShort, formatTimestamp, parseCpu, parseMemory } from "../../lib/format";
import { isBuiltinApiVersion } from "../../lib/status";
import { MetricsUnavailable } from "./RelatedTab";
import { EmptyState } from "../../design-system/components/EmptyState";
import { Spinner } from "../../design-system/components/Spinner";
import { MetricsChart } from "../../design-system/components/MetricsChart";
import { useMetricsHistory } from "./useMetricsHistory";

/**
 * Radar-style Metrics tab. The live sample comes from metrics.k8s.io; the mini
 * charts read the main process' ring buffer (one sample per 30s, one hour), so
 * they start filling when the tab is opened — there is no Prometheus history
 * behind them and no synthetic data.
 */

type ContainerSpec = {
  name?: string;
  resources?: {
    requests?: { cpu?: string; memory?: string };
    limits?: { cpu?: string; memory?: string };
  };
};

/** Sum a request/limit across containers; undefined when nobody sets one. */
function sumResource(
  containers: ContainerSpec[],
  field: "requests" | "limits",
  resource: "cpu" | "memory",
): number | undefined {
  let total: number | undefined;
  for (const container of containers) {
    const raw = container.resources?.[field]?.[resource];
    if (raw === undefined || raw === null || raw === "") continue;
    const value = resource === "cpu" ? parseCpu(raw) : parseMemory(raw);
    if (value === undefined) continue;
    total = (total ?? 0) + value;
  }
  return total;
}

/**
 * Main samples every container at the same timestamp, so summing by timestamp
 * gives the pod total without assuming every container has the same history.
 */
function aggregateSeries(series: MetricsSeries[]): MetricsDataPoint[] {
  const byTimestamp = new Map<number, MetricsDataPoint>();
  for (const entry of series) {
    for (const point of entry.dataPoints) {
      const total = byTimestamp.get(point.timestamp) ?? { timestamp: point.timestamp, cpu: 0, memory: 0 };
      total.cpu += point.cpu;
      total.memory += point.memory;
      byTimestamp.set(point.timestamp, total);
    }
  }
  return [...byTimestamp.values()].sort((left, right) => left.timestamp - right.timestamp);
}

function lastPoint(points: MetricsDataPoint[]): MetricsDataPoint | undefined {
  return points[points.length - 1];
}

function SampleLegend({
  request,
  limit,
  format,
  limitLabel = "limit",
}: {
  request?: number;
  limit?: number;
  format: (value: number) => string;
  limitLabel?: string;
}) {
  if (!request && !limit) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[calc(9px*var(--font-scale))] text-theme-text-disabled">
      {request ? (
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 border-t border-dashed" style={{ borderColor: "var(--color-warning)" }} />
          <span className="font-mono">request {format(request)}</span>
        </span>
      ) : null}
      {limit ? (
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 border-t border-dashed" style={{ borderColor: "var(--color-error)" }} />
          <span className="font-mono">
            {limitLabel} {format(limit)}
          </span>
        </span>
      ) : null}
    </div>
  );
}

function MetricCard({
  label,
  icon,
  current,
  points,
  metric,
  request,
  limit,
  format,
  legend,
  height = 88,
}: {
  label: string;
  icon: ReactNode;
  current?: number;
  points: MetricsDataPoint[];
  metric: "cpu" | "memory";
  request?: number;
  limit?: number;
  format: (value: number) => string;
  legend?: ReactNode;
  height?: number;
}) {
  return (
    <div className="card-inner-lg min-w-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[calc(10px*var(--font-scale))] uppercase tracking-wide text-theme-text-tertiary">
          {icon}
          {label}
        </span>
        <span className="font-mono text-[calc(13px*var(--font-scale))] text-theme-text-primary">
          {current === undefined ? "–" : format(current)}
        </span>
      </div>
      <MetricsChart
        points={points}
        metric={metric}
        height={height}
        request={request}
        limit={limit}
        format={format}
      />
      {legend ?? <SampleLegend request={request} limit={limit} format={format} />}
    </div>
  );
}

export function MetricsTab({
  clusterId,
  object,
  resources,
}: {
  clusterId: string;
  object: KubeObject;
  resources: ApiResourceInfo[];
}) {
  const kind = object.kind;
  const builtin = isBuiltinApiVersion(object.apiVersion);
  const isPod = builtin && kind === "Pod";
  const isNode = builtin && kind === "Node";
  const namespace = object.metadata?.namespace;
  const name = object.metadata?.name ?? "";

  const metricsApi = resources.some(
    (resource) => resource.group === "metrics.k8s.io" && resource.kind === (isNode ? "NodeMetrics" : "PodMetrics"),
  );

  const { history, loading, error } = useMetricsHistory({
    clusterId,
    kind,
    namespace,
    name,
    active: (isPod || isNode) && metricsApi,
  });

  if (!isPod && !isNode) {
    return (
      <EmptyState
        icon={<ChartColumn />}
        title="Metrics are collected per Pod and Node"
        description="Open a Pod or Node to see live usage from metrics-server. Workload metrics are shown by aggregating their Pods in the Related tab."
      />
    );
  }

  if (!metricsApi) {
    return (
      <MetricsUnavailable reason="The metrics.k8s.io API was not discovered in this cluster. Install metrics-server (or a compatible adapter) and reconnect to see live CPU and memory usage." />
    );
  }

  if (loading && !history) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner label="Reading metrics…" />
      </div>
    );
  }

  if (history?.unavailable) {
    return (
      <MetricsUnavailable reason="The metrics.k8s.io API disappeared from discovery. metrics-server may be restarting — reconnect the cluster once it is back." />
    );
  }

  if (error && !history) {
    return (
      <MetricsUnavailable
        reason={`The metrics API is installed but this object could not be read: ${error}. The metrics-server may still be starting or RBAC may deny access.`}
      />
    );
  }

  const points = history?.series ?? [];
  const podPoints = isPod ? aggregateSeries(points) : points[0]?.dataPoints ?? [];
  const latest = lastPoint(podPoints);
  const sampleTime = latest ? new Date(latest.timestamp).toISOString() : undefined;
  const keptSeconds = (history?.capacity ?? 120) * (history?.intervalSeconds ?? 30);
  const keptLabel = keptSeconds >= 3600 ? `${Math.round(keptSeconds / 3600)}h` : `${Math.round(keptSeconds / 60)}m`;

  // Requests/limits come from the Pod spec, never from the sample. Numeric
  // sums stay undefined when no container declares one, so the chart draws no
  // line instead of a line at zero.
  const specContainers = ((object.spec?.containers as ContainerSpec[] | undefined) ?? []).filter(Boolean);
  const podLimits = isPod
    ? {
        cpu: sumResource(specContainers, "limits", "cpu"),
        memory: sumResource(specContainers, "limits", "memory"),
      }
    : undefined;
  const podRequests = isPod
    ? {
        cpu: sumResource(specContainers, "requests", "cpu"),
        memory: sumResource(specContainers, "requests", "memory"),
      }
    : undefined;

  const allocatableCpu = isNode ? parseCpu((object.status?.allocatable as Record<string, string> | undefined)?.cpu) : undefined;
  const allocatableMemory = isNode
    ? parseMemory((object.status?.allocatable as Record<string, string> | undefined)?.memory)
    : undefined;

  const historyContainers = points.map((series) => series.name);
  const containerNames = [...new Set([...specContainers.map((container) => container.name ?? ""), ...historyContainers])]
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));

  return (
    <div className="space-y-3 p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <Cpu className="h-4 w-4 shrink-0 text-accent-text" />
        <span className="text-[calc(13px*var(--font-scale))] font-medium text-theme-text-primary">Live resource usage</span>
        <span className="ml-auto text-[calc(10px*var(--font-scale))] text-theme-text-tertiary">
          {formatTimestamp(sampleTime)} · sampled every {history?.intervalSeconds ?? 30}s · kept {keptLabel}
        </span>
      </div>

      {history?.collectionError ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[calc(11px*var(--font-scale))] leading-relaxed text-amber-700 dark:text-amber-300">
          <span className="font-medium">Metrics collection error:</span>{" "}
          <span className="break-all">{history.collectionError}</span>
        </div>
      ) : null}

      {error && history ? (
        <div className="text-[calc(10px*var(--font-scale))] text-warning-text">
          The chart could not be refreshed: {error}
        </div>
      ) : null}

      {!latest ? (
        <div className="card-inner-lg text-[calc(11px*var(--font-scale))] leading-relaxed text-theme-text-tertiary">
          No sample has been collected for this {isPod ? "Pod" : "Node"} yet. mLens reads metrics.k8s.io every 30
          seconds while this tab is open; a Pod that has not started, or a kubelet metrics-server cannot reach,
          produces no sample at all.
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-2">
          <MetricCard
            label="CPU"
            icon={<Cpu className="h-3 w-3" />}
            current={latest.cpu}
            points={podPoints}
            metric="cpu"
            request={isNode ? undefined : podRequests?.cpu}
            limit={isNode ? undefined : podLimits?.cpu}
            format={(value) => formatCpuMilli(value)}
            legend={
              isNode ? (
                <span className="mt-1 block font-mono text-[calc(9px*var(--font-scale))] text-theme-text-disabled">
                  allocatable {allocatableCpu === undefined ? "–" : formatCpuMilli(allocatableCpu)}
                </span>
              ) : undefined
            }
          />
          <MetricCard
            label="Memory"
            icon={<Database className="h-3 w-3" />}
            current={latest.memory}
            points={podPoints}
            metric="memory"
            request={isNode ? undefined : podRequests?.memory}
            limit={isNode ? undefined : podLimits?.memory}
            format={(value) => formatMemoryShort(value)}
            legend={
              isNode ? (
                <span className="mt-1 block font-mono text-[calc(9px*var(--font-scale))] text-theme-text-disabled">
                  allocatable {allocatableMemory === undefined ? "–" : formatMemoryShort(allocatableMemory)}
                </span>
              ) : undefined
            }
          />
        </div>
      )}

      {isPod ? (
        <div className="space-y-2">
          <div className="text-[calc(10px*var(--font-scale))] uppercase tracking-wide text-theme-text-tertiary">
            Containers
          </div>
          {containerNames.length === 0 ? (
            <div className="text-[calc(11px*var(--font-scale))] text-theme-text-tertiary">
              metrics-server has not reported a container for this Pod yet.
            </div>
          ) : (
            containerNames.map((containerName) => {
              const spec = specContainers.find((container) => container.name === containerName);
              const series = points.find((entry) => entry.name === containerName);
              const seriesPoints = series?.dataPoints ?? [];
              const containerLatest = lastPoint(seriesPoints);
              const requestCpu = spec ? sumResource([spec], "requests", "cpu") : undefined;
              const requestMemory = spec ? sumResource([spec], "requests", "memory") : undefined;
              const limitCpu = spec ? sumResource([spec], "limits", "cpu") : undefined;
              const limitMemory = spec ? sumResource([spec], "limits", "memory") : undefined;
              return (
                <div key={containerName} className="card-inner-lg min-w-0">
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                    <span className="truncate font-mono text-[calc(11px*var(--font-scale))] text-theme-text-primary">
                      {containerName}
                    </span>
                    <span className="font-mono text-[calc(10px*var(--font-scale))] text-theme-text-tertiary">
                      {containerLatest
                        ? `${formatCpuMilli(containerLatest.cpu)} · ${formatMemoryShort(containerLatest.memory)}`
                        : "–"}
                    </span>
                  </div>
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <div className="text-[calc(9px*var(--font-scale))] uppercase tracking-wide text-theme-text-disabled">
                        CPU
                      </div>
                      <MetricsChart
                        points={seriesPoints}
                        metric="cpu"
                        height={46}
                        request={requestCpu}
                        limit={limitCpu}
                        format={(value) => formatCpuMilli(value)}
                        emptyLabel="No samples yet"
                      />
                      <SampleLegend request={requestCpu} limit={limitCpu} format={(value) => formatCpuMilli(value)} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[calc(9px*var(--font-scale))] uppercase tracking-wide text-theme-text-disabled">
                        Memory
                      </div>
                      <MetricsChart
                        points={seriesPoints}
                        metric="memory"
                        height={46}
                        request={requestMemory}
                        limit={limitMemory}
                        format={(value) => formatMemoryShort(value)}
                        emptyLabel="No samples yet"
                      />
                      <SampleLegend request={requestMemory} limit={limitMemory} format={(value) => formatMemoryShort(value)} />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : null}

      <p className="text-[calc(10px*var(--font-scale))] leading-relaxed text-theme-text-disabled">
        Samples come from the Kubernetes metrics.k8s.io API and are collected by mLens every 30 seconds while this
        tab has been open. The newest hour is kept in memory, so a freshly opened tab starts with a short line rather
        than an invented past; older history needs Prometheus.
      </p>
    </div>
  );
}
