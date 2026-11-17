import { useEffect, useState, type ReactNode } from "react";
import { Box, Cpu, Database, Globe, Info, Server, ShieldCheck, Tag } from "lucide-react";
import type { KubeObject } from "@shared/types";
import { api, call, errorText } from "../../lib/api";
import { formatAge, formatBytes, formatCpu, formatTimestamp, parseCpu, parseMemory } from "../../lib/format";
import { resourceStatus, toneClass } from "../../lib/status";
import { nodeConditionSummary, nodeRoles, nodeTaints } from "../../lib/columns";
import { ConditionsList, DetailSection, Property, PropertyList } from "./DetailSections";
import type { OverviewProps } from "./OverviewTab";

type AnyObject = any;

const PODS_LIMIT = 500;

function StatusPill({ object, kind }: { object: AnyObject; kind: string }) {
  const status = resourceStatus(object, kind);
  return <span className={`badge ${toneClass(status.tone)}`}>{status.text}</span>;
}

function Banner({
  tone,
  title,
  children,
}: {
  tone: "error" | "warning" | "info";
  title: string;
  children?: ReactNode;
}) {
  const palette =
    tone === "error"
      ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
      : tone === "warning"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
  return (
    <div className={`rounded-lg border px-3 py-2 text-[12px] leading-relaxed ${palette}`}>
      <div className="font-medium">{title}</div>
      {children ? <div className="mt-1 space-y-0.5">{children}</div> : null}
    </div>
  );
}

/** Pods scheduled on this node — the node's live workload list. */
function useNodePods(clusterId: string, nodeName: string | undefined, refreshSeconds: number) {
  const [pods, setPods] = useState<KubeObject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    if (!nodeName) return;
    let disposed = false;
    const load = async () => {
      setLoading(true);
      try {
        const result = await call(
          api.resources.list({
            clusterId,
            apiVersion: "v1",
            kind: "Pod",
            fieldSelector: `spec.nodeName=${nodeName}`,
            limit: PODS_LIMIT,
          }),
        );
        if (disposed) return;
        const sorted = [...result.items].sort((a, b) => {
          const left = `${a.metadata?.namespace ?? ""}/${a.metadata?.name ?? ""}`;
          const right = `${b.metadata?.namespace ?? ""}/${b.metadata?.name ?? ""}`;
          return left.localeCompare(right);
        });
        setPods(sorted);
        setTruncated(Boolean(result.continueToken));
        setError(null);
      } catch (listError) {
        if (!disposed) setError(errorText(listError));
      } finally {
        if (!disposed) setLoading(false);
      }
    };
    void load();
    if (!refreshSeconds) return () => { disposed = true; };
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, Math.max(30, refreshSeconds) * 1000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [clusterId, nodeName, refreshSeconds]);

  return { pods, loading, error, truncated };
}

/** Live metrics.k8s.io sample for a single node; absent API is reported honestly. */
function useNodeMetrics(clusterId: string, nodeName: string | undefined, refreshSeconds: number) {
  const [sample, setSample] = useState<{ cpu: number; memory: number; timestamp?: string } | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);

  useEffect(() => {
    if (!nodeName) return;
    let disposed = false;
    const load = async () => {
      try {
        const metrics = (await call(
          api.resources.get({
            clusterId,
            apiVersion: "metrics.k8s.io/v1beta1",
            kind: "NodeMetrics",
            name: nodeName,
          }),
        )) as KubeObject & { usage?: { cpu?: string; memory?: string }; timestamp?: string };
        if (disposed) return;
        setSample({
          cpu: parseCpu(metrics.usage?.cpu) ?? 0,
          memory: parseMemory(metrics.usage?.memory) ?? 0,
          timestamp: metrics.timestamp,
        });
        setUnavailable(null);
      } catch (metricsError) {
        if (disposed) return;
        setSample(null);
        setUnavailable(errorText(metricsError));
      }
    };
    void load();
    if (!refreshSeconds) return () => { disposed = true; };
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, Math.max(60, refreshSeconds) * 1000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [clusterId, nodeName, refreshSeconds]);

  return { sample, unavailable };
}

function capacityRow(value: string | number | undefined, key: string): string {
  if (value === undefined || value === null || value === "") return "–";
  if (key === "cpu") return formatCpu(parseCpu(value));
  if (key === "memory" || key === "ephemeral-storage") return formatBytes(parseMemory(value));
  return String(value);
}

function NodePodsSection({
  pods,
  loading,
  error,
  truncated,
  onNavigate,
}: {
  pods: KubeObject[];
  loading: boolean;
  error: string | null;
  truncated: boolean;
  onNavigate: OverviewProps["onNavigate"];
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? pods : pods.slice(0, 30);

  return (
    <DetailSection title="Pods on this node" icon={<Box />} count={pods.length}>
      {error ? (
        <div className="text-xs text-theme-text-tertiary">Pod list unavailable: {error}</div>
      ) : loading && pods.length === 0 ? (
        <div className="text-xs text-theme-text-tertiary">Loading pods…</div>
      ) : pods.length === 0 ? (
        <div className="text-xs text-theme-text-tertiary">No pods are scheduled on this node.</div>
      ) : (
        <div className="space-y-0.5">
          {visible.map((pod) => {
            const status = resourceStatus(pod, "Pod");
            const key = `${pod.metadata?.namespace}/${pod.metadata?.name}`;
            return (
              <button
                key={key}
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-theme-hover"
                onClick={() => onNavigate("Pod", pod.metadata?.name ?? "", pod.metadata?.namespace)}
                title={`Open Pod ${key}`}
              >
                <span className={`badge-sm shrink-0 ${toneClass(status.tone)}`}>{status.text}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-theme-text-primary">
                  {pod.metadata?.name}
                </span>
                <span className="shrink-0 text-[11px] text-theme-text-tertiary">{pod.metadata?.namespace}</span>
              </button>
            );
          })}
          {pods.length > visible.length ? (
            <button
              type="button"
              className="mt-1 w-full rounded-md border border-theme-border-subtle px-2 py-1 text-[11px] text-theme-text-secondary transition-colors hover:bg-theme-hover"
              onClick={() => setExpanded(true)}
            >
              Show all {pods.length} pods
            </button>
          ) : null}
          {truncated ? (
            <div className="pt-1 text-[11px] text-theme-text-tertiary">
              The API truncated this list at {PODS_LIMIT} pods.
            </div>
          ) : null}
        </div>
      )}
    </DetailSection>
  );
}

export function NodeOverview({ object, onNavigate, clusterId, refreshSeconds = 60 }: OverviewProps & { refreshSeconds?: number }) {
  const status = object.status ?? {};
  const capacity = status.capacity ?? {};
  const allocatable = status.allocatable ?? {};
  const info = status.nodeInfo ?? {};
  const labels = (object.metadata?.labels ?? {}) as Record<string, string>;
  const nodeName = String(object.metadata?.name ?? "");
  const cordoned = object.spec?.unschedulable === true;
  const roles = nodeRoles(object);
  const conditions = nodeConditionSummary(object);
  const taints = nodeTaints(object);
  const addresses = (status.addresses ?? []) as Array<{ type: string; address: string }>;

  const { pods, loading: podsLoading, error: podsError, truncated: podsTruncated } = useNodePods(
    clusterId,
    nodeName,
    refreshSeconds,
  );
  const { sample: metrics, unavailable: metricsUnavailable } = useNodeMetrics(clusterId, nodeName, refreshSeconds);

  const instanceType = labels["node.kubernetes.io/instance-type"];
  const zone = labels["topology.kubernetes.io/zone"];
  const region = labels["topology.kubernetes.io/region"];
  const nodePool = labels["cloud.google.com/gke-nodepool"] || labels["eks.amazonaws.com/nodegroup"] || labels["karpenter.sh/nodepool"];
  const machineFamily = labels["cloud.google.com/machine-family"];
  const hasPlatform = Boolean(instanceType || zone || region || nodePool || machineFamily);

  const inUse = {
    cpu: metrics?.cpu,
    memory: metrics?.memory,
    pods: pods.length,
  };

  const capacityEntries = [
    { key: "cpu", label: "CPU", icon: <Cpu className="h-3.5 w-3.5" /> },
    { key: "memory", label: "Memory", icon: <Database className="h-3.5 w-3.5" /> },
    { key: "pods", label: "Pods", icon: <Box className="h-3.5 w-3.5" /> },
    { key: "ephemeral-storage", label: "Ephemeral storage", icon: <Server className="h-3.5 w-3.5" /> },
  ];

  const usageRows = [
    {
      key: "cpu",
      label: "CPU",
      used: metrics?.cpu,
      allocatable: parseCpu(allocatable.cpu) ?? 0,
      format: (value: number) => formatCpu(value),
      detail: `${allocatable.cpu ?? "–"} allocatable`,
    },
    {
      key: "memory",
      label: "Memory",
      used: metrics?.memory,
      allocatable: parseMemory(allocatable.memory) ?? 0,
      format: (value: number) => formatBytes(value),
      detail: `${capacityRow(allocatable.memory, "memory")} allocatable`,
    },
  ];

  return (
    <div className="space-y-4">
      {conditions.problems.length > 0 ? (
        <Banner tone={conditions.healthy ? "info" : "error"} title="Issues detected">
          {conditions.problems.map((problem) => (
            <div key={problem}>{problem}</div>
          ))}
        </Banner>
      ) : null}
      {cordoned ? (
        <Banner tone="warning" title="Cordoned">
          New pods will not be scheduled on this node. Resume scheduling only after confirming maintenance has finished.
        </Banner>
      ) : null}

      <DetailSection title="Status" icon={<Info />}>
        <PropertyList>
          <Property label="Status" value={<StatusPill object={object} kind="Node" />} />
          <Property label="Schedulable" value={cordoned ? "No (cordoned)" : "Yes"} />
          <Property label="Roles" value={roles.join(", ") || "<none>"} />
          <Property label="Age" value={formatAge(object.metadata?.creationTimestamp)} />
        </PropertyList>
        {/* {onToggleCordon ? (
          <div className="mt-3 flex items-center gap-2 border-t border-theme-border-subtle pt-2.5">
            <button
              type="button"
              className="flex h-7 items-center gap-1.5 rounded-lg border border-theme-border-light bg-theme-elevated px-2.5 text-[11px] font-medium text-theme-text-secondary transition-colors hover:bg-theme-hover hover:text-theme-text-primary"
              onClick={onToggleCordon}
            >
              <Ban className="h-3 w-3" />
              {cordoned ? "Uncordon node" : "Cordon node"}
            </button>
          </div>
        ) : null} */}
      </DetailSection>

      <DetailSection title="Node info" icon={<Server />}>
        <PropertyList>
          <Property label="OS" value={info.osImage} />
          <Property label="Architecture" value={info.architecture} />
          <Property label="Kernel" value={info.kernelVersion} mono />
          <Property label="Container runtime" value={info.containerRuntimeVersion} mono />
          <Property label="Kubelet" value={info.kubeletVersion} mono />
          {/* <Property label="Kube-proxy" value={info.kubeProxyVersion} mono /> */}
        </PropertyList>
      </DetailSection>

      {addresses.length > 0 ? (
        <DetailSection title="Addresses" icon={<Globe />}>
          <PropertyList>
            {addresses.map((address) => (
              <Property
                key={`${address.type}-${address.address}`}
                label={address.type}
                value={address.address}
                mono
                copyable
              />
            ))}
          </PropertyList>
        </DetailSection>
      ) : null}

      <DetailSection title="Resource usage" icon={<Cpu />} defaultOpen={Boolean(metrics)}>
        {!metrics ? (
          <div className="text-xs text-theme-text-tertiary">
            {metricsUnavailable ? `metrics.k8s.io is unavailable for this cluster: ${metricsUnavailable}` : "No metrics sample yet."}
          </div>
        ) : (
          <div className="space-y-3">
            {usageRows.map((row) => {
              const percent = row.allocatable > 0 && row.used !== undefined ? (row.used / row.allocatable) * 100 : 0;
              const bar =
                percent > 85 ? "bg-red-500" : percent > 60 ? "bg-amber-500" : "bg-emerald-500";
              return (
                <div key={row.key} className="card-inner-lg">
                  <div className="mb-1.5 flex items-baseline justify-between text-xs">
                    <span className="font-medium text-theme-text-primary">{row.label}</span>
                    <span className="text-theme-text-tertiary">{row.detail}</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-lg font-semibold text-theme-text-primary">
                      {row.used !== undefined ? row.format(row.used) : "–"}
                    </span>
                    <span className="text-xs text-theme-text-tertiary">
                      / {row.allocatable > 0 ? row.format(row.allocatable) : "–"}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-theme-elevated">
                    <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(100, percent)}%` }} />
                  </div>
                </div>
              );
            })}
            {metrics.timestamp ? (
              <div className="text-[11px] text-theme-text-tertiary">
                Last updated {formatTimestamp(metrics.timestamp)}
              </div>
            ) : null}
          </div>
        )}
      </DetailSection>

      <DetailSection title="Capacity" icon={<Cpu />}>
        <div className="space-y-2">
          {capacityEntries.map((entry) => {
            const cap = capacity[entry.key];
            const alloc = allocatable[entry.key];
            const used =
              entry.key === "cpu"
                ? inUse.cpu !== undefined
                  ? formatCpu(inUse.cpu)
                  : undefined
                : entry.key === "memory"
                  ? inUse.memory !== undefined
                    ? formatBytes(inUse.memory)
                    : undefined
                  : entry.key === "pods"
                    ? String(inUse.pods)
                    : undefined;
            return (
              <div key={entry.key} className="card-inner">
                <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-theme-text-secondary">
                  {entry.icon}
                  {entry.label}
                </div>
                <div className="space-y-0.5 text-xs">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-theme-text-tertiary">Capacity</span>
                    <span className="tabular-nums text-theme-text-primary">{capacityRow(cap, entry.key)}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-theme-text-tertiary">Allocatable</span>
                    <span className="tabular-nums text-theme-text-primary">{capacityRow(alloc, entry.key)}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-theme-text-tertiary">In use</span>
                    <span className="tabular-nums font-medium text-theme-text-primary">{used ?? "–"}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {metricsUnavailable ? (
          <div className="mt-2 text-[11px] text-theme-text-tertiary">
            Usage is unavailable: {metricsUnavailable}
          </div>
        ) : null}
      </DetailSection>



      <NodePodsSection
        pods={pods}
        loading={podsLoading}
        error={podsError}
        truncated={podsTruncated}
        onNavigate={onNavigate}
      />



      {hasPlatform ? (
        <DetailSection title="Platform" icon={<Tag />} defaultOpen={false}>
          <PropertyList>
            <Property label="Instance type" value={instanceType} mono />
            <Property label="Zone" value={zone} mono />
            <Property label="Region" value={region} mono />
            <Property label="Node pool" value={nodePool} mono />
            <Property label="Machine family" value={machineFamily} mono />
          </PropertyList>
        </DetailSection>
      ) : null}

      <DetailSection title="Taints" icon={<ShieldCheck />} defaultOpen={taints.length > 0 && taints.length <= 5} count={taints.length}>
        {taints.length === 0 ? (
          <div className="text-xs text-theme-text-tertiary">No taints.</div>
        ) : (
          <div className="space-y-1">
            {taints.map((taint, index) => (
              <div key={`${taint.text}-${index}`} className="flex items-center gap-2 font-mono text-[11px]">
                <span
                  className={`badge-sm ${
                    taint.effect === "NoSchedule"
                      ? "status-degraded"
                      : taint.effect === "NoExecute"
                        ? "status-unhealthy"
                        : "status-neutral"
                  }`}
                >
                  {taint.text}
                </span>
              </div>
            ))}
          </div>
        )}
      </DetailSection>

      <DetailSection title="Conditions" icon={<ShieldCheck />} count={status.conditions?.length ?? 0}>
        <ConditionsList conditions={status.conditions ?? []} />
      </DetailSection>
    </div>
  );
}
