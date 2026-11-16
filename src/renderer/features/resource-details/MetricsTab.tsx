import { useEffect, useState } from "react";
import { ChartColumn, Cpu } from "lucide-react";
import type { ApiResourceInfo, KubeObject } from "@shared/types";
import { api, call, errorText } from "../../lib/api";
import { formatCpu, formatTimestamp, parseCpu, parseMemory, formatBytes } from "../../lib/format";
import { MetricsUnavailable } from "./RelatedTab";
import { EmptyState } from "../../design-system/components/EmptyState";
import { Spinner } from "../../design-system/components/Spinner";

export function MetricsTab({
  clusterId,
  object,
  resources,
  refreshSeconds,
}: {
  clusterId: string;
  object: KubeObject;
  resources: ApiResourceInfo[];
  refreshSeconds: number;
}) {
  const kind = object.kind;
  const podMetrics = resources.find((resource) => resource.kind === "PodMetrics");
  const nodeMetrics = resources.find((resource) => resource.kind === "NodeMetrics");
  const isPod = kind === "Pod";
  const isNode = kind === "Node";
  const metricResource = isPod ? podMetrics : isNode ? nodeMetrics : undefined;

  const [metrics, setMetrics] = useState<KubeObject | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!metricResource) return;
    let disposed = false;
    const load = async () => {
      setLoading(true);
      try {
        const next = await call(
          api.resources.get({
            clusterId,
            apiVersion: metricResource.apiVersion,
            kind: metricResource.kind,
            namespace: isPod ? object.metadata?.namespace : undefined,
            name: object.metadata?.name,
          }),
        );
        if (disposed) return;
        setMetrics(next);
        setError(null);
      } catch (fetchError) {
        if (!disposed) setError(errorText(fetchError));
      } finally {
        if (!disposed) setLoading(false);
      }
    };
    void load();
    if (!refreshSeconds) return () => { disposed = true; };
    const timer = window.setInterval(() => setNonce((value) => value + 1), Math.max(5, refreshSeconds) * 1000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [clusterId, metricResource, isPod, object.metadata?.name, object.metadata?.namespace, refreshSeconds, nonce]);

  if (!isPod && !isNode) {
    return (
      <EmptyState
        icon={<ChartColumn />}
        title="Metrics are collected per Pod and Node"
        description="Open a Pod or Node to see live usage from metrics-server. Workload metrics are shown by aggregating their Pods in the Related tab."
      />
    );
  }

  if (!metricResource) {
    return (
      <MetricsUnavailable reason="The metrics.k8s.io API was not discovered in this cluster. Install metrics-server (or a compatible adapter) and reconnect to see live CPU and memory usage." />
    );
  }

  if (loading && !metrics) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner label="Reading metrics…" />
      </div>
    );
  }

  if (error) {
    return (
      <MetricsUnavailable
        reason={`The metrics API is installed but this object could not be read: ${error}. The metrics-server may still be starting or RBAC may deny access.`}
      />
    );
  }

  const containers = (metrics?.containers ?? []) as Array<{ name: string; usage?: { cpu?: string; memory?: string } }>;
  const totalCpu = containers.reduce((sum, container) => sum + (parseCpu(container.usage?.cpu) ?? 0), 0);
  const totalMemory = containers.reduce((sum, container) => sum + (parseMemory(container.usage?.memory) ?? 0), 0);

  return (
    <div className="space-y-4 p-3">
      <div className="flex items-center gap-2">
        <Cpu className="h-4 w-4 text-accent-text" />
        <span className="text-[13px] font-medium text-theme-text-primary">Live resource usage</span>
        <span className="ml-auto text-[10px] text-theme-text-tertiary">
          {formatTimestamp((metrics as any)?.timestamp)} · window {(metrics as any)?.window ?? "–"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="card-inner">
          <div className="text-[10px] uppercase tracking-wide text-theme-text-tertiary">CPU</div>
          <div className="mt-0.5 font-mono text-lg text-theme-text-primary">{formatCpu(totalCpu)}</div>
        </div>
        <div className="card-inner">
          <div className="text-[10px] uppercase tracking-wide text-theme-text-tertiary">Memory</div>
          <div className="mt-0.5 font-mono text-lg text-theme-text-primary">{formatBytes(totalMemory)}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-theme-border">
        <div className="grid grid-cols-3 border-b border-theme-border bg-theme-base px-2 py-1 text-[10px] uppercase tracking-wide text-theme-text-tertiary">
          <span>Container</span>
          <span className="text-right">CPU</span>
          <span className="text-right">Memory</span>
        </div>
        {containers.map((container) => (
          <div key={container.name} className="grid grid-cols-3 border-b-subtle px-2 py-1.5 text-[11px] last:border-0">
            <span className="truncate font-mono text-theme-text-primary">{container.name}</span>
            <span className="text-right font-mono text-theme-text-secondary">{formatCpu(parseCpu(container.usage?.cpu))}</span>
            <span className="text-right font-mono text-theme-text-secondary">{formatBytes(parseMemory(container.usage?.memory))}</span>
          </div>
        ))}
        {containers.length === 0 ? (
          <div className="px-2 py-2 text-xs text-theme-text-tertiary">No container metrics in this sample.</div>
        ) : null}
      </div>

      <p className="text-[10px] leading-relaxed text-theme-text-disabled">
        Values come from the Kubernetes metrics.k8s.io API. Historical charts require Prometheus and are not
        implemented in this build.
      </p>
    </div>
  );
}
