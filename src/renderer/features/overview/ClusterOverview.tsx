import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Boxes,
  Cpu,
  Database,
  FolderOpen,
  Layers,
  Network,
  RefreshCw,
  Server,
  ShieldCheck,
  TriangleExclamationPoint,
} from "lucide-react";
import type { ApiResourceInfo, KubeObject } from "@shared/types";
import { useCatalogStore } from "../../stores/catalog-store";
import { useSessionStore } from "../../stores/session-store";
import { api, call, errorText } from "../../lib/api";
import { cn } from "../../lib/cn";
import { formatBytes, formatCpu, parseCpu, parseMemory } from "../../lib/format";
import { getKindIcon, kindLabel } from "../../lib/icons";
import { Spinner } from "../../design-system/components/Spinner";

interface KindCount {
  key: string;
  kind: string;
  apiVersion: string;
  value: number;
  atLeast?: boolean;
  error?: string;
}

const COUNT_KINDS = [
  { kind: "Pod", apiVersion: "v1", label: "Pods" },
  { kind: "Deployment", apiVersion: "apps/v1", label: "Deployments" },
  { kind: "StatefulSet", apiVersion: "apps/v1", label: "StatefulSets" },
  { kind: "DaemonSet", apiVersion: "apps/v1", label: "DaemonSets" },
  { kind: "ReplicaSet", apiVersion: "apps/v1", label: "ReplicaSets" },
  { kind: "Job", apiVersion: "batch/v1", label: "Jobs" },
  { kind: "CronJob", apiVersion: "batch/v1", label: "CronJobs" },
  { kind: "Service", apiVersion: "v1", label: "Services" },
  { kind: "ConfigMap", apiVersion: "v1", label: "ConfigMaps" },
  { kind: "Secret", apiVersion: "v1", label: "Secrets" },
  { kind: "PersistentVolumeClaim", apiVersion: "v1", label: "PVCs" },
  { kind: "Namespace", apiVersion: "v1", label: "Namespaces" },
];

function Card({
  title,
  icon,
  value,
  hint,
  tone,
}: {
  title: string;
  icon: React.ReactNode;
  value: string;
  hint?: string;
  tone?: "warning" | "success";
}) {
  return (
    <div className="card-inner flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[calc(10px*var(--font-scale))] font-medium uppercase tracking-wider text-theme-text-tertiary">
        {icon}
        <span className="truncate">{title}</span>
      </div>
      <div
        className={cn(
          "font-mono text-[calc(22px*var(--font-scale))] font-semibold leading-tight",
          tone === "warning" ? "text-amber-500" : tone === "success" ? "text-emerald-500" : "text-theme-text-primary",
        )}
      >
        {value}
      </div>
      {hint ? <div className="truncate text-[calc(10px*var(--font-scale))] text-theme-text-tertiary">{hint}</div> : null}
    </div>
  );
}

// Stable fallbacks: selector results must keep their identity (React #185).
const EMPTY_RESOURCES: ApiResourceInfo[] = [];
const EMPTY_NAMESPACES: string[] = [];

export function ClusterOverview({ clusterId, active }: { clusterId: string; active: boolean }) {
  // A14: field-level session selectors (this view polls every 30s+).
  const status = useSessionStore((state) => state.sessions[clusterId]?.status);
  const resources = useSessionStore((state) => state.sessions[clusterId]?.resources) ?? EMPTY_RESOURCES;
  const selectedNamespaces =
    useSessionStore((state) => state.sessions[clusterId]?.selectedNamespaces) ?? EMPTY_NAMESPACES;
  const info = useSessionStore((state) => state.sessions[clusterId]?.info) ?? null;
  const selectKind = useSessionStore((state) => state.selectKind);
  const openDetails = useSessionStore((state) => state.openDetails);
  const clusters = useCatalogStore((state) => state.clusters);
  const settings = useCatalogStore((state) => state.settings);

  const [counts, setCounts] = useState<KindCount[]>([]);
  const [nodes, setNodes] = useState<KubeObject[]>([]);
  const [warnings, setWarnings] = useState<KubeObject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const namespaces = selectedNamespaces;
  const singleNamespace = namespaces.length === 1 ? namespaces[0] : undefined;
  const cluster = clusters.find((entry) => entry.id === clusterId);
  const refreshSeconds = settings?.refreshIntervalSeconds ?? 60;

  const byKind = useMemo(() => {
    const map = new Map<string, KindCount>();
    for (const entry of counts) map.set(entry.kind, entry);
    return map;
  }, [counts]);

  useEffect(() => {
    if (!active || status !== "connected") return;
    let disposed = false;

    const load = async (quiet: boolean) => {
      if (!quiet) setLoading(true);
      try {
        const resolved = COUNT_KINDS.map((entry) => {
          const resource = resources.find(
            (candidate) => candidate.kind === entry.kind && candidate.apiVersion === entry.apiVersion,
          );
          return resource ? { ...entry, resource } : null;
        }).filter((entry): entry is (typeof COUNT_KINDS)[number] & { resource: ApiResourceInfo } => Boolean(entry));

        const [countResult, nodeResult, eventResult] = await Promise.all([
          resolved.length
            ? call(
                api.resources.counts({
                  clusterId,
                  resources: resolved.map((entry) => ({
                    apiVersion: entry.resource.apiVersion,
                    kind: entry.resource.kind,
                    namespace: entry.resource.namespaced ? singleNamespace : undefined,
                  })),
                }),
              )
            : Promise.resolve([]),
          call(api.resources.list({ clusterId, apiVersion: "v1", kind: "Node", limit: 500 })).catch(() => ({
            items: [] as KubeObject[],
          })),
          call(
            api.resources.list({
              clusterId,
              apiVersion: "v1",
              kind: "Event",
              namespace: singleNamespace,
              fieldSelector: "type=Warning",
              limit: 20,
            }),
          ).catch(() => ({ items: [] as KubeObject[] })),
        ]);

        if (disposed) return;

        setCounts(
          resolved.map((entry, index) => {
            const result = countResult[index];
            return {
              key: `${entry.resource.apiVersion}|${entry.resource.kind}`,
              kind: entry.kind,
              apiVersion: entry.resource.apiVersion,
              value: result?.count ?? 0,
              atLeast: result?.atLeast,
              error: result?.error,
            };
          }),
        );
        setNodes(nodeResult.items ?? []);
        setWarnings(
          [...(eventResult.items ?? [])].sort((left, right) => {
            const leftTime = String((left as any).lastTimestamp ?? (left as any).eventTime ?? "");
            const rightTime = String((right as any).lastTimestamp ?? (right as any).eventTime ?? "");
            return rightTime.localeCompare(leftTime);
          }),
        );
        setError(null);
        setUpdatedAt(Date.now());
      } catch (loadError) {
        if (!disposed) setError(errorText(loadError));
      } finally {
        if (!disposed) setLoading(false);
      }
    };

    void load(false);
    const interval =
      refreshSeconds > 0 ? window.setInterval(() => void load(true), Math.max(30, refreshSeconds) * 1000) : null;
    return () => {
      disposed = true;
      if (interval) window.clearInterval(interval);
    };
    // `resources` identity is stable for a connected session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, clusterId, status, selectedNamespaces, refreshSeconds, refreshKey]);

  const readyNodes = nodes.filter((node) =>
    ((node.status?.conditions ?? []) as Array<Record<string, unknown>>).some(
      (condition) => condition.type === "Ready" && condition.status === "True",
    ),
  ).length;

  const totals = useMemo(() => {
    let cpuCapacity = 0;
    let cpuAllocatable = 0;
    let memoryCapacity = 0;
    let memoryAllocatable = 0;
    for (const node of nodes) {
      const capacity = node.status?.capacity as Record<string, string> | undefined;
      const allocatable = node.status?.allocatable as Record<string, string> | undefined;
      cpuCapacity += parseCpu(capacity?.cpu) ?? 0;
      cpuAllocatable += parseCpu(allocatable?.cpu) ?? 0;
      memoryCapacity += parseMemory(capacity?.memory) ?? 0;
      memoryAllocatable += parseMemory(allocatable?.memory) ?? 0;
    }
    return { cpuCapacity, cpuAllocatable, memoryCapacity, memoryAllocatable };
  }, [nodes]);

  const crdCount = resources.filter((resource) => resource.isCrd).length;
  const podCount = byKind.get("Pod");
  const warningCount = warnings.length;
  const openKind = (kind: string) => {
    const resource = resources.find((candidate) => candidate.kind === kind);
    if (resource) selectKind(clusterId, { apiVersion: resource.apiVersion, kind: resource.kind });
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-theme-base">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-theme-border bg-theme-base px-4">
        <Layers className="h-4 w-4 text-accent-text" />
        <h1 className="text-[calc(14px*var(--font-scale))] font-semibold text-theme-text-primary">Cluster overview</h1>
        <span className="font-mono text-[calc(11px*var(--font-scale))] text-theme-text-tertiary">
          {cluster?.name ?? ""} {info?.version ? `· ${info.version}` : ""}
        </span>
        <div className="ml-auto flex items-center gap-2 text-[calc(10px*var(--font-scale))] text-theme-text-tertiary">
          {loading ? <Spinner label="" /> : null}
          {updatedAt ? <span>updated {new Date(updatedAt).toLocaleTimeString()}</span> : null}
          <button
            type="button"
            className="shell-icon-button h-7 w-7"
            title="Reload overview"
            onClick={() => {
              setUpdatedAt(null);
              setCounts([]);
              setNodes([]);
              setWarnings([]);
              // The effect only reloads on scope changes; force a re-mount key.
              setRefreshKey((value) => value + 1);
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1400px] space-y-4 p-4">
          {error ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[calc(12px*var(--font-scale))] text-red-500">
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            <Card
              title="Nodes ready"
              icon={<Server className="h-3.5 w-3.5" />}
              value={`${readyNodes}/${nodes.length || "–"}`}
              hint={`${totals.cpuAllocatable ? formatCpu(totals.cpuAllocatable) : "–"} CPU allocatable`}
              tone={nodes.length > 0 && readyNodes === nodes.length ? "success" : undefined}
            />
            <Card title="Pods" icon={<Boxes className="h-3.5 w-3.5" />} value={podCount ? `${podCount.value}${podCount.atLeast ? "+" : ""}` : "–"} hint="in the current namespace scope" />
            <Card title="Deployments" icon={<Layers className="h-3.5 w-3.5" />} value={byKind.get("Deployment")?.value.toString() ?? "–"} hint="workloads" />
            <Card title="Namespaces" icon={<FolderOpen className="h-3.5 w-3.5" />} value={byKind.get("Namespace")?.value.toString() ?? "–"} hint="cluster-wide" />
            <Card title="Services" icon={<Network className="h-3.5 w-3.5" />} value={byKind.get("Service")?.value.toString() ?? "–"} hint="network" />
            <Card
              title="Warning events"
              icon={<TriangleExclamationPoint className="h-3.5 w-3.5" />}
              value={loading && warnings.length === 0 ? "–" : String(warningCount)}
              hint={warningCount > 0 ? "most recent 20 are fetched" : "none in scope"}
              tone={warningCount > 0 ? "warning" : undefined}
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-lg border border-theme-border bg-theme-surface">
              <div className="flex items-center gap-2 border-b border-theme-border px-3 py-2 text-[calc(11px*var(--font-scale))] font-semibold uppercase tracking-wide text-theme-text-tertiary">
                <Cpu className="h-3.5 w-3.5" />
                Capacity
              </div>
              <div className="grid grid-cols-2 gap-2 p-3">
                <Card
                  title="CPU allocatable"
                  icon={<Cpu className="h-3.5 w-3.5" />}
                  value={totals.cpuAllocatable ? formatCpu(totals.cpuAllocatable) : "–"}
                  hint={`capacity ${totals.cpuCapacity ? formatCpu(totals.cpuCapacity) : "–"}`}
                />
                <Card
                  title="Memory allocatable"
                  icon={<Database className="h-3.5 w-3.5" />}
                  value={totals.memoryAllocatable ? formatBytes(totals.memoryAllocatable) : "–"}
                  hint={`capacity ${totals.memoryCapacity ? formatBytes(totals.memoryCapacity) : "–"}`}
                />
              </div>
            </div>

            <div className="rounded-lg border border-theme-border bg-theme-surface">
              <div className="flex items-center gap-2 border-b border-theme-border px-3 py-2 text-[calc(11px*var(--font-scale))] font-semibold uppercase tracking-wide text-theme-text-tertiary">
                <ShieldCheck className="h-3.5 w-3.5" />
                Workloads & config
              </div>
              <div className="grid grid-cols-3 gap-2 p-3">
                {[
                  "StatefulSet",
                  "DaemonSet",
                  "ReplicaSet",
                  "Job",
                  "CronJob",
                  "ConfigMap",
                  "Secret",
                  "PersistentVolumeClaim",
                ].map((kind) => {
                  const entry = byKind.get(kind);
                  const Icon = getKindIcon(kind);
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => openKind(kind)}
                      className="flex min-w-0 items-center gap-2 rounded-md border border-theme-border-subtle bg-theme-base px-2 py-1.5 text-left transition-colors hover:border-theme-border hover:bg-theme-hover"
                      title={`Open ${kind}`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 text-theme-text-tertiary" />
                      <span className="min-w-0 flex-1 truncate text-[calc(11px*var(--font-scale))] text-theme-text-secondary">
                        {kindLabel(kind)}
                      </span>
                      <span className="font-mono text-[calc(11px*var(--font-scale))] text-theme-text-primary">{entry?.value ?? "–"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-lg border border-theme-border bg-theme-surface">
              <div className="flex items-center gap-2 border-b border-theme-border px-3 py-2 text-[calc(11px*var(--font-scale))] font-semibold uppercase tracking-wide text-theme-text-tertiary">
                <TriangleExclamationPoint className="h-3.5 w-3.5" />
                Recent warnings
              </div>
              <div className="max-h-72 overflow-y-auto">
                {warnings.length === 0 ? (
                  <div className="px-3 py-4 text-[calc(11px*var(--font-scale))] text-theme-text-tertiary">
                    No warning events in the current namespace scope.
                  </div>
                ) : (
                  warnings.slice(0, 8).map((event, index) => {
                    const involved = (event as any).involvedObject ?? {};
                    return (
                      <button
                        key={`${event.metadata?.uid ?? index}`}
                        type="button"
                        className="flex w-full items-start gap-2 border-b border-theme-border-subtle px-3 py-2 text-left last:border-0 hover:bg-theme-hover/60"
                        title={`Open ${involved.kind ?? "object"} ${involved.name ?? ""}`}
                        onClick={() => {
                          if (!involved.name || !involved.kind) return;
                          const resource = resources.find(
                            (candidate) =>
                              candidate.kind === involved.kind &&
                              (!involved.apiVersion || candidate.apiVersion === involved.apiVersion),
                          );
                          if (!resource) return;
                          openDetails(clusterId, {
                            clusterId,
                            apiVersion: resource.apiVersion,
                            kind: resource.kind,
                            namespace: involved.namespace,
                            name: involved.name,
                          });
                        }}
                      >
                        <Activity className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-[calc(11px*var(--font-scale))] font-medium text-theme-text-primary">
                              {(event as any).reason ?? "Warning"}
                            </span>
                            <span className="truncate font-mono text-[calc(10px*var(--font-scale))] text-theme-text-tertiary">
                              {involved.kind}/{involved.name}
                            </span>
                          </div>
                          <div className="truncate text-[calc(10px*var(--font-scale))] text-theme-text-tertiary">
                            {(event as any).message ?? ""}
                          </div>
                        </div>
                        {event.metadata?.namespace ? (
                          <span className="shrink-0 font-mono text-[calc(10px*var(--font-scale))] text-theme-text-disabled">
                            {event.metadata.namespace}
                          </span>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="rounded-lg border border-theme-border bg-theme-surface">
              <div className="flex items-center gap-2 border-b border-theme-border px-3 py-2 text-[calc(11px*var(--font-scale))] font-semibold uppercase tracking-wide text-theme-text-tertiary">
                <Network className="h-3.5 w-3.5" />
                API surface
              </div>
              <div className="grid grid-cols-2 gap-2 p-3">
                <Card title="API kinds" icon={<Boxes className="h-3.5 w-3.5" />} value={String(resources.length)} hint="discovered in this cluster" />
                <Card title="Custom resources" icon={<Database className="h-3.5 w-3.5" />} value={String(crdCount)} hint="CRDs served" />
                <Card
                  title="Secrets"
                  icon={<ShieldCheck className="h-3.5 w-3.5" />}
                  value={byKind.get("Secret")?.value.toString() ?? "–"}
                  hint="values are never listed in tables"
                />
                <Card
                  title="Namespaces visible"
                  icon={<Server className="h-3.5 w-3.5" />}
                  value={String(info?.namespaces.length ?? "–")}
                  hint="in the API discovery scope"
                />
              </div>
            </div>
          </div>

          <div className="text-[calc(10px*var(--font-scale))] text-theme-text-disabled">
            Counts use `limit=1` + `remainingItemCount`; warnings are the 20 most recent Warning events in scope.
            No numbers are invented: an unavailable count shows `–`.
          </div>
        </div>
      </div>
    </div>
  );
}
