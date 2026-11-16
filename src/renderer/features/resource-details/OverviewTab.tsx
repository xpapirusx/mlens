import { Box, Cpu, Database, FileSliders, Info, Network, Server, Settings2, ShieldCheck } from "lucide-react";
import type { ApiResourceInfo } from "@shared/types";
import { ConditionsList, DetailSection, KeyValueList, NestedObject, Property, PropertyList } from "./DetailSections";
import { formatAge, formatCpu, formatTimestamp, parseCpu, parseMemory, titleCase } from "../../lib/format";
import { resourceStatus, toneClass } from "../../lib/status";
import { formatBytes } from "../../lib/format";

type AnyObject = any;

export interface OverviewProps {
  object: AnyObject;
  resource: ApiResourceInfo;
  onNavigate: (kind: string, name: string, namespace?: string) => void;
}

function ResourceLink({
  kind,
  name,
  namespace,
  onNavigate,
}: {
  kind: string;
  name?: string;
  namespace?: string;
  onNavigate: OverviewProps["onNavigate"];
}) {
  if (!name) return <>–</>;
  return (
    <button
      type="button"
      className="truncate text-accent-text hover:underline"
      onClick={() => onNavigate(kind, name, namespace)}
      title={`Open ${kind}/${name}`}
    >
      {name}
    </button>
  );
}

function StatusPill({ object, kind }: { object: AnyObject; kind: string }) {
  const status = resourceStatus(object, kind);
  return <span className={`badge ${toneClass(status.tone)}`}>{status.text}</span>;
}

export function OverviewTab(props: OverviewProps) {
  const kind = props.resource.kind.toLowerCase();
  switch (kind) {
    case "pod":
      return <PodOverview {...props} />;
    case "deployment":
    case "statefulset":
    case "daemonset":
    case "replicaset":
      return <WorkloadOverview {...props} />;
    case "job":
    case "cronjob":
      return <JobOverview {...props} />;
    case "service":
      return <ServiceOverview {...props} />;
    case "ingress":
      return <IngressOverview {...props} />;
    case "configmap":
    case "secret":
      return <DataOverview {...props} />;
    case "node":
      return <NodeOverview {...props} />;
    case "namespace":
      return <NamespaceOverview {...props} />;
    case "event":
      return <EventOverview {...props} />;
    case "persistentvolumeclaim":
    case "persistentvolume":
      return <StorageOverview {...props} />;
    case "customresourcedefinition":
      return <CrdOverview {...props} />;
    case "horizontalpodautoscaler":
      return <HpaOverview {...props} />;
    default:
      return <GenericOverview {...props} />;
  }
}

function PodOverview({ object, resource, onNavigate }: OverviewProps) {
  const containerStatuses = [
    ...(object.status?.initContainerStatuses ?? []),
    ...(object.status?.containerStatuses ?? []),
  ] as Array<Record<string, any>>;

  return (
    <div className="space-y-4">
      <DetailSection title="Status" icon={<Info />}>
        <PropertyList>
          <Property label="Phase" value={<StatusPill object={object} kind="Pod" />} />
          <Property
            label="Node"
            value={<ResourceLink kind="Node" name={object.spec?.nodeName} onNavigate={onNavigate} />}
            copyable
          />
          <Property label="Pod IP" value={object.status?.podIP} mono copyable />
          <Property label="Host IP" value={object.status?.hostIP} mono copyable />
          <Property label="QoS class" value={object.status?.qosClass} />
          <Property
            label="Service account"
            value={
              <ResourceLink
                kind="ServiceAccount"
                name={object.spec?.serviceAccountName ?? "default"}
                namespace={object.metadata?.namespace}
                onNavigate={onNavigate}
              />
            }
          />
          <Property label="Restart policy" value={object.spec?.restartPolicy} />
          <Property label="Priority class" value={object.spec?.priorityClassName} />
          <Property label="Started" value={object.status?.startTime ? formatTimestamp(object.status.startTime) : "–"} />
          <Property
            label="Owner"
            value={
              object.metadata?.ownerReferences?.[0] ? (
                <ResourceLink
                  kind={object.metadata.ownerReferences[0].kind}
                  name={object.metadata.ownerReferences[0].name}
                  namespace={object.metadata.namespace}
                  onNavigate={onNavigate}
                />
              ) : (
                "–"
              )
            }
          />
          <Property label="Age" value={formatAge(object.metadata?.creationTimestamp)} />
        </PropertyList>
      </DetailSection>

      <DetailSection
        title="Containers"
        icon={<Box />}
        count={(object.spec?.containers?.length ?? 0) + (object.spec?.initContainers?.length ?? 0)}
      >
        <div className="space-y-2">
          {[...(object.spec?.initContainers ?? []), ...(object.spec?.containers ?? [])].map(
            (container: Record<string, any>) => {
              const status = containerStatuses.find((entry) => entry.name === container.name);
              const state = status?.state ?? {};
              const stateKey = Object.keys(state)[0] ?? "unknown";
              return (
                <div key={container.name} className="card-inner-lg">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium text-theme-text-primary">{container.name}</span>
                    <span
                      className={`badge-sm ${toneClass(
                        status?.ready ? "success" : stateKey === "waiting" ? "warning" : "error",
                      )}`}
                    >
                      {status?.ready ? "Ready" : stateKey === "waiting" ? (state.waiting?.reason ?? "Waiting") : stateKey}
                    </span>
                    {status?.restartCount ? (
                      <span className="badge-sm status-unknown">{status.restartCount} restarts</span>
                    ) : null}
                    <span className="ml-auto font-mono text-[10px] text-theme-text-disabled">
                      {container.image?.split("@")[0]}
                    </span>
                  </div>
                  <div className="mt-1.5 break-all font-mono text-[10px] text-theme-text-tertiary">
                    {container.image}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                    <span className="text-theme-text-tertiary">
                      CPU:{" "}
                      <span className="font-mono text-theme-text-secondary">
                        {formatCpu(parseCpu(container.resources?.requests?.cpu))} req /{" "}
                        {formatCpu(parseCpu(container.resources?.limits?.cpu))} lim
                      </span>
                    </span>
                    <span className="text-theme-text-tertiary">
                      Memory:{" "}
                      <span className="font-mono text-theme-text-secondary">
                        {formatBytes(parseMemory(container.resources?.requests?.memory))} req /{" "}
                        {formatBytes(parseMemory(container.resources?.limits?.memory))} lim
                      </span>
                    </span>
                    {container.ports?.length ? (
                      <span className="text-theme-text-tertiary">
                        Ports:{" "}
                        <span className="font-mono text-theme-text-secondary">
                          {container.ports
                            .map((port: any) => `${port.containerPort}/${port.protocol ?? "TCP"}`)
                            .join(", ")}
                        </span>
                      </span>
                    ) : null}
                    <span className="text-theme-text-tertiary">
                      Env:{" "}
                      <span className="font-mono text-theme-text-secondary">{container.env?.length ?? 0} vars</span>
                    </span>
                  </div>
                  {state.waiting?.message || state.terminated?.message ? (
                    <div className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-300">
                      {state.waiting?.message ?? state.terminated?.message}
                    </div>
                  ) : null}
                </div>
              );
            },
          )}
        </div>
      </DetailSection>

      <DetailSection
        title="Conditions"
        icon={<ShieldCheck />}
        count={object.status?.conditions?.length ?? 0}
      >
        <ConditionsList conditions={object.status?.conditions ?? []} />
      </DetailSection>

      <DetailSection title="Volumes" icon={<Database />} defaultOpen={false}>
        <div className="space-y-1.5">
          {(object.spec?.volumes ?? []).length === 0 ? (
            <div className="text-xs text-theme-text-tertiary">No volumes.</div>
          ) : (
            (object.spec.volumes as Array<Record<string, any>>).map((volume) => (
              <div key={volume.name} className="flex items-center gap-2 text-[12px]">
                <span className="w-40 shrink-0 truncate font-mono text-[11px] text-theme-text-tertiary">
                  {volume.name}
                </span>
                <span className="truncate text-theme-text-secondary">
                  {volume.configMap
                    ? `configMap/${volume.configMap.name}`
                    : volume.secret
                      ? `secret/${volume.secret.secretName}`
                      : volume.persistentVolumeClaim
                        ? `pvc/${volume.persistentVolumeClaim.claimName}`
                        : volume.emptyDir
                          ? "emptyDir"
                          : volume.hostPath
                            ? `hostPath ${volume.hostPath.path}`
                            : volume.projected
                              ? "projected"
                              : Object.keys(volume).find((key) => key !== "name") ?? "–"}
                </span>
              </div>
            ))
          )}
        </div>
      </DetailSection>

      <DetailSection title="Tolerations & affinity" icon={<Settings2 />} defaultOpen={false}>
        <PropertyList>
          <Property label="Node selector" value={
            Object.entries(object.spec?.nodeSelector ?? {}).map(([k, v]) => `${k}=${v}`).join(", ") || "–"
          } />
          <Property label="Tolerations" value={object.spec?.tolerations?.length ?? 0} />
          <Property label="Affinity" value={object.spec?.affinity ? "configured" : "none"} />
          <Property label="Resource" value={resource.apiVersion} mono />
        </PropertyList>
        {object.spec?.affinity ? (
          <div className="mt-2 card-inner">
            <NestedObject value={object.spec.affinity} />
          </div>
        ) : null}
      </DetailSection>
    </div>
  );
}

function WorkloadOverview({ object, onNavigate }: OverviewProps) {
  const spec = object.spec ?? {};
  const status = object.status ?? {};
  const containers = (spec.template?.spec?.containers ?? []) as Array<Record<string, any>>;

  return (
    <div className="space-y-4">
      <DetailSection title="Status" icon={<Info />}>
        <PropertyList>
          <Property label="Status" value={<StatusPill object={object} kind={object.kind} />} />
          <Property label="Desired replicas" value={spec.replicas ?? 1} />
          <Property label="Ready replicas" value={status.readyReplicas ?? 0} />
          <Property label="Available replicas" value={status.availableReplicas ?? 0} />
          <Property label="Updated replicas" value={status.updatedReplicas ?? 0} />
          {status.unavailableReplicas ? (
            <Property
              label="Unavailable"
              value={<span className="text-red-600 dark:text-red-400">{status.unavailableReplicas}</span>}
            />
          ) : null}
          <Property label="Observed generation" value={`${status.observedGeneration ?? 0} / ${object.metadata?.generation ?? 0}`} />
          <Property label="Strategy" value={spec.strategy?.type ?? spec.updateStrategy?.type ?? "–"} />
          <Property label="Revision history" value={spec.revisionHistoryLimit ?? "–"} />
          <Property label="Age" value={formatAge(object.metadata?.creationTimestamp)} />
        </PropertyList>
      </DetailSection>

      <DetailSection title="Selector" icon={<Network />}>
        <div className="flex flex-wrap gap-1">
          {Object.entries(spec.selector?.matchLabels ?? {}).map(([key, value]) => (
            <span key={key} className="badge-sm status-unknown font-mono">
              {key}={String(value)}
            </span>
          ))}
          {Object.keys(spec.selector?.matchLabels ?? {}).length === 0 ? (
            <span className="text-xs text-theme-text-tertiary">No matchLabels selector.</span>
          ) : null}
        </div>
      </DetailSection>

      <DetailSection title="Containers" icon={<Box />} count={containers.length}>
        <div className="space-y-2">
          {containers.map((container) => (
            <div key={container.name} className="card-inner-lg">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-theme-text-primary">{container.name}</span>
                <span className="ml-auto font-mono text-[10px] text-theme-text-tertiary">
                  {container.image?.split("@")[0]}
                </span>
              </div>
              <div className="mt-1 break-all font-mono text-[10px] text-theme-text-tertiary">{container.image}</div>
              <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-theme-text-tertiary">
                <span>CPU {formatCpu(parseCpu(container.resources?.requests?.cpu))} req / {formatCpu(parseCpu(container.resources?.limits?.cpu))} lim</span>
                <span>Memory {formatBytes(parseMemory(container.resources?.requests?.memory))} req / {formatBytes(parseMemory(container.resources?.limits?.memory))} lim</span>
              </div>
            </div>
          ))}
        </div>
      </DetailSection>

      <DetailSection title="Conditions" icon={<ShieldCheck />} count={status.conditions?.length ?? 0}>
        <ConditionsList conditions={status.conditions ?? []} />
      </DetailSection>

      <DetailSection title="Related" icon={<Server />} defaultOpen={false}>
        <PropertyList>
          <Property
            label="Owner"
            value={
              object.metadata?.ownerReferences?.[0]?.name ? (
                <ResourceLink
                  kind={object.metadata.ownerReferences[0].kind}
                  name={object.metadata.ownerReferences[0].name}
                  namespace={object.metadata.namespace}
                  onNavigate={onNavigate}
                />
              ) : (
                "–"
              )
            }
          />
          <Property label="Related resources" value="See the Related tab" />
        </PropertyList>
      </DetailSection>
    </div>
  );
}

function JobOverview({ object }: OverviewProps) {
  const isCron = object.kind === "CronJob";
  const status = object.status ?? {};
  const spec = object.spec ?? {};

  return (
    <div className="space-y-4">
      <DetailSection title="Status" icon={<Info />}>
        <PropertyList>
          <Property label="Status" value={<StatusPill object={object} kind={object.kind} />} />
          {isCron ? (
            <>
              <Property label="Schedule" value={<span className="font-mono">{spec.schedule}</span>} />
              <Property label="Suspended" value={spec.suspend ? "Yes" : "No"} />
              <Property label="Concurrency policy" value={spec.concurrencyPolicy ?? "Allow"} />
              <Property label="Last schedule" value={status.lastScheduleTime ? formatTimestamp(status.lastScheduleTime) : "–"} />
              <Property label="Active jobs" value={status.active?.length ?? 0} />
            </>
          ) : (
            <>
              <Property label="Succeeded" value={status.succeeded ?? 0} />
              <Property label="Failed" value={status.failed ?? 0} />
              <Property label="Active" value={status.active ?? 0} />
              <Property label="Completions" value={`${status.succeeded ?? 0} / ${spec.completions ?? 1}`} />
              <Property label="Parallelism" value={spec.parallelism ?? 1} />
              <Property label="Started" value={status.startTime ? formatTimestamp(status.startTime) : "–"} />
              <Property label="Completed" value={status.completionTime ? formatTimestamp(status.completionTime) : "–"} />
            </>
          )}
          <Property label="Age" value={formatAge(object.metadata?.creationTimestamp)} />
        </PropertyList>
      </DetailSection>

      <DetailSection title="Conditions" icon={<ShieldCheck />}>
        <ConditionsList conditions={status.conditions ?? []} />
      </DetailSection>

      {!isCron ? (
        <DetailSection title="Pod template" icon={<Box />} defaultOpen={false}>
          <NestedObject value={spec.template} />
        </DetailSection>
      ) : null}
    </div>
  );
}

function ServiceOverview({ object, onNavigate }: OverviewProps) {
  const spec = object.spec ?? {};
  return (
    <div className="space-y-4">
      <DetailSection title="Service" icon={<Network />}>
        <PropertyList>
          <Property label="Type" value={spec.type ?? "ClusterIP"} />
          <Property label="Cluster IP" value={spec.clusterIP} mono copyable />
          <Property label="Cluster IPs" value={(spec.clusterIPs ?? []).join(", ")} mono />
          <Property label="External IPs" value={(spec.externalIPs ?? []).join(", ")} mono />
          <Property label="Load balancer" value={object.status?.loadBalancer?.ingress?.[0]?.ip ?? object.status?.loadBalancer?.ingress?.[0]?.hostname} mono />
          <Property label="Session affinity" value={spec.sessionAffinity ?? "None"} />
          <Property label="External name" value={spec.externalName} />
          <Property label="Age" value={formatAge(object.metadata?.creationTimestamp)} />
        </PropertyList>
      </DetailSection>

      <DetailSection title="Ports" icon={<Network />} count={spec.ports?.length ?? 0}>
        <div className="overflow-hidden rounded-md border border-theme-border">
          <div className="grid grid-cols-4 border-b border-theme-border bg-theme-base px-2 py-1 text-[10px] uppercase tracking-wide text-theme-text-tertiary">
            <span>Name</span>
            <span>Port</span>
            <span>Target</span>
            <span>Protocol</span>
          </div>
          {(spec.ports ?? []).map((port: any, index: number) => (
            <div key={index} className="grid grid-cols-4 border-b-subtle px-2 py-1 text-[11px] last:border-0">
              <span className="truncate text-theme-text-primary">{port.name ?? "–"}</span>
              <span className="font-mono text-theme-text-secondary">{port.port}</span>
              <span className="font-mono text-theme-text-secondary">{port.targetPort ?? "–"}</span>
              <span className="text-theme-text-secondary">{port.protocol ?? "TCP"}</span>
            </div>
          ))}
          {(spec.ports ?? []).length === 0 ? <div className="px-2 py-2 text-xs text-theme-text-tertiary">No ports.</div> : null}
        </div>
      </DetailSection>

      <DetailSection title="Selector" icon={<ShieldCheck />}>
        <div className="flex flex-wrap gap-1">
          {Object.entries(spec.selector ?? {}).map(([key, value]) => (
            <span key={key} className="badge-sm status-unknown font-mono">
              {key}={String(value)}
            </span>
          ))}
          {Object.keys(spec.selector ?? {}).length === 0 ? (
            <span className="text-xs text-theme-text-tertiary">No selector (external or headless).</span>
          ) : (
            <button
              type="button"
              className="ml-2 text-[11px] text-accent-text hover:underline"
              onClick={() => onNavigate("Pod", "", object.metadata?.namespace)}
            >
              View pods in Related
            </button>
          )}
        </div>
      </DetailSection>
    </div>
  );
}

function IngressOverview({ object }: OverviewProps) {
  const spec = object.spec ?? {};
  return (
    <div className="space-y-4">
      <DetailSection title="Ingress" icon={<Network />}>
        <PropertyList>
          <Property label="Class" value={spec.ingressClassName} />
          <Property label="Address" value={object.status?.loadBalancer?.ingress?.map((entry: any) => entry.ip ?? entry.hostname).join(", ")} mono />
          <Property label="Default backend" value={spec.defaultBackend?.service?.name} />
          <Property label="Age" value={formatAge(object.metadata?.creationTimestamp)} />
        </PropertyList>
      </DetailSection>

      <DetailSection title="Rules" icon={<Network />} count={spec.rules?.length ?? 0}>
        <div className="space-y-2">
          {(spec.rules ?? []).map((rule: any, index: number) => (
            <div key={index} className="card-inner">
              <div className="text-[12px] font-medium text-theme-text-primary">{rule.host ?? "*"}</div>
              <div className="mt-1 space-y-0.5">
                {(rule.http?.paths ?? []).map((path: any, pathIndex: number) => (
                  <div key={pathIndex} className="flex items-center gap-2 font-mono text-[11px]">
                    <span className="text-theme-text-secondary">{path.path ?? "/"}</span>
                    <span className="text-theme-text-disabled">→</span>
                    <span className="text-theme-text-secondary">
                      {path.backend?.service?.name}:{path.backend?.service?.port?.number ?? path.backend?.service?.port?.name}
                    </span>
                    <span className="text-theme-text-disabled">{path.pathType ?? "Prefix"}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {(spec.rules ?? []).length === 0 ? <div className="text-xs text-theme-text-tertiary">No rules.</div> : null}
        </div>
      </DetailSection>

      <DetailSection title="TLS" icon={<ShieldCheck />} count={spec.tls?.length ?? 0} defaultOpen={false}>
        {(spec.tls ?? []).map((tls: any, index: number) => (
          <div key={index} className="flex items-center gap-2 text-[12px]">
            <span className="font-mono text-theme-text-secondary">{(tls.hosts ?? []).join(", ") || "*"}</span>
            <span className="text-theme-text-disabled">→</span>
            <span className="font-mono text-theme-text-tertiary">{tls.secretName}</span>
          </div>
        ))}
        {(spec.tls ?? []).length === 0 ? <div className="text-xs text-theme-text-tertiary">No TLS configuration.</div> : null}
      </DetailSection>
    </div>
  );
}

function DataOverview({ object }: OverviewProps) {
  const isSecret = object.kind === "Secret";
  const data = isSecret ? (object.data ?? {}) : { ...(object.data ?? {}), ...(object.binaryData ?? {}) };
  return (
    <div className="space-y-4">
      <DetailSection title={isSecret ? "Secret" : "ConfigMap"} icon={<FileSliders />}>
        <PropertyList>
          {isSecret ? <Property label="Type" value={object.type} /> : null}
          <Property label="Keys" value={Object.keys(data).length} />
          <Property label="Immutable" value={object.immutable ? "Yes" : "No"} />
          <Property label="Age" value={formatAge(object.metadata?.creationTimestamp)} />
        </PropertyList>
      </DetailSection>
      <DetailSection title="Data" icon={<Database />} count={Object.keys(data).length}>
        <KeyValueList data={data as Record<string, string>} secret={isSecret} />
      </DetailSection>
    </div>
  );
}

function NodeOverview({ object }: OverviewProps) {
  const status = object.status ?? {};
  const capacity = status.capacity ?? {};
  const allocatable = status.allocatable ?? {};
  const info = status.nodeInfo ?? {};
  const roles = Object.keys(object.metadata?.labels ?? {})
    .filter((key) => key.startsWith("node-role.kubernetes.io/"))
    .map((key) => key.replace("node-role.kubernetes.io/", ""));

  return (
    <div className="space-y-4">
      <DetailSection title="Status" icon={<Server />}>
        <PropertyList>
          <Property label="Status" value={<StatusPill object={object} kind="Node" />} />
          <Property label="Roles" value={roles.join(", ") || "<none>"} />
          <Property label="Kubelet" value={info.kubeletVersion} mono />
          <Property label="OS image" value={info.osImage} />
          <Property label="Kernel" value={info.kernelVersion} mono />
          <Property label="Container runtime" value={info.containerRuntimeVersion} mono />
          <Property label="Architecture" value={info.architecture} />
          <Property label="Internal IP" value={status.addresses?.find((address: any) => address.type === "InternalIP")?.address} mono copyable />
          <Property label="Hostname" value={status.addresses?.find((address: any) => address.type === "Hostname")?.address} mono />
          <Property label="Age" value={formatAge(object.metadata?.creationTimestamp)} />
        </PropertyList>
      </DetailSection>

      <DetailSection title="Capacity & allocatable" icon={<Cpu />}>
        <div className="overflow-hidden rounded-md border border-theme-border">
          <div className="grid grid-cols-5 border-b border-theme-border bg-theme-base px-2 py-1 text-[10px] uppercase tracking-wide text-theme-text-tertiary">
            <span>Resource</span>
            <span>Capacity</span>
            <span>Allocatable</span>
            <span className="col-span-2">Utilization</span>
          </div>
          {["cpu", "memory", "pods", "ephemeral-storage"].map((key) => {
            const cap = capacity[key];
            const alloc = allocatable[key];
            const ratio =
              key === "cpu"
                ? (parseCpu(alloc) ?? 0) / Math.max(1, parseCpu(cap) ?? 1)
                : key === "memory"
                  ? (parseMemory(alloc) ?? 0) / Math.max(1, parseMemory(cap) ?? 1)
                  : null;
            return (
              <div key={key} className="grid grid-cols-5 items-center border-b-subtle px-2 py-1 text-[11px] last:border-0">
                <span className="text-theme-text-secondary">{titleCase(key)}</span>
                <span className="font-mono text-theme-text-primary">{cap ?? "–"}</span>
                <span className="font-mono text-theme-text-secondary">{alloc ?? "–"}</span>
                <div className="col-span-2">
                  {ratio !== null ? (
                    <div className="h-1.5 overflow-hidden rounded-full bg-theme-elevated">
                      <div className="h-full rounded-full bg-skyhook-500" style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </DetailSection>

      <DetailSection title="Conditions" icon={<ShieldCheck />} count={status.conditions?.length ?? 0}>
        <ConditionsList conditions={status.conditions ?? []} />
      </DetailSection>

      {object.spec?.taints?.length ? (
        <DetailSection title="Taints" icon={<ShieldCheck />} defaultOpen={false} count={object.spec.taints.length}>
          <div className="space-y-1">
            {object.spec.taints.map((taint: any, index: number) => (
              <div key={index} className="flex gap-2 font-mono text-[11px]">
                <span className="text-theme-text-primary">{taint.key}</span>
                <span className="text-theme-text-tertiary">={taint.value ?? ""}</span>
                <span className="badge-sm status-degraded">{taint.effect}</span>
              </div>
            ))}
          </div>
        </DetailSection>
      ) : null}
    </div>
  );
}

function NamespaceOverview({ object }: OverviewProps) {
  const labels = object.metadata?.labels ?? {};
  return (
    <div className="space-y-4">
      <DetailSection title="Namespace" icon={<Info />}>
        <PropertyList>
          <Property label="Status" value={<StatusPill object={object} kind="Namespace" />} />
          <Property label="Age" value={formatAge(object.metadata?.creationTimestamp)} />
          <Property label="Labels" value={Object.keys(labels).length} />
        </PropertyList>
      </DetailSection>
      <DetailSection title="Labels" icon={<Settings2 />} defaultOpen={false}>
        <div className="flex flex-wrap gap-1">
          {Object.entries(labels).map(([key, value]) => (
            <span key={key} className="badge-sm status-unknown font-mono">
              {key}={String(value)}
            </span>
          ))}
          {Object.keys(labels).length === 0 ? <span className="text-xs text-theme-text-tertiary">No labels.</span> : null}
        </div>
      </DetailSection>
    </div>
  );
}

function EventOverview({ object, onNavigate }: OverviewProps) {
  return (
    <div className="space-y-4">
      <DetailSection title="Event" icon={<Info />}>
        <PropertyList>
          <Property label="Type" value={<StatusPill object={object} kind="Event" />} />
          <Property label="Reason" value={object.reason} />
          <Property label="Message" value={object.message} />
          <Property label="Count" value={object.count ?? 1} />
          <Property label="First seen" value={object.firstTimestamp ? formatTimestamp(object.firstTimestamp) : "–"} />
          <Property label="Last seen" value={object.lastTimestamp ? formatTimestamp(object.lastTimestamp) : "–"} />
          <Property label="Source" value={object.source?.component} />
          <Property
            label="Involved object"
            value={
              <ResourceLink
                kind={object.involvedObject?.kind}
                name={object.involvedObject?.name}
                namespace={object.involvedObject?.namespace}
                onNavigate={onNavigate}
              />
            }
          />
        </PropertyList>
      </DetailSection>
    </div>
  );
}

function StorageOverview({ object, onNavigate }: OverviewProps) {
  const isPvc = object.kind === "PersistentVolumeClaim";
  const spec = object.spec ?? {};
  const status = object.status ?? {};
  return (
    <div className="space-y-4">
      <DetailSection title="Storage" icon={<Database />}>
        <PropertyList>
          <Property label="Status" value={<StatusPill object={object} kind={object.kind} />} />
          <Property label="Capacity" value={status.capacity?.storage} mono />
          <Property label="Access modes" value={(spec.accessModes ?? []).join(", ")} />
          <Property label="Storage class" value={spec.storageClassName} />
          <Property label="Volume mode" value={spec.volumeMode ?? "Filesystem"} />
          {isPvc ? (
            <>
              <Property
                label="Volume"
                value={<ResourceLink kind="PersistentVolume" name={spec.volumeName} onNavigate={onNavigate} />}
                copyable
              />
              <Property label="Requested" value={spec.resources?.requests?.storage} mono />
            </>
          ) : (
            <>
              <Property label="Reclaim policy" value={spec.persistentVolumeReclaimPolicy} />
              <Property label="Claim" value={
                <ResourceLink
                  kind="PersistentVolumeClaim"
                  name={spec.claimRef?.name}
                  namespace={spec.claimRef?.namespace}
                  onNavigate={onNavigate}
                />
              } />
              <Property label="CSI driver" value={spec.csi?.driver} />
            </>
          )}
          <Property label="Age" value={formatAge(object.metadata?.creationTimestamp)} />
        </PropertyList>
      </DetailSection>
    </div>
  );
}

function CrdOverview({ object }: OverviewProps) {
  const spec = object.spec ?? {};
  return (
    <div className="space-y-4">
      <DetailSection title="Definition" icon={<Settings2 />}>
        <PropertyList>
          <Property label="Group" value={spec.group} mono copyable />
          <Property label="Scope" value={spec.scope} />
          <Property label="Kind" value={spec.names?.kind} />
          <Property label="Plural" value={spec.names?.plural} mono />
          <Property label="Short names" value={(spec.names?.shortNames ?? []).join(", ") || "–"} />
          <Property label="Categories" value={(spec.names?.categories ?? []).join(", ") || "–"} />
        </PropertyList>
      </DetailSection>
      <DetailSection title="Versions" icon={<Database />} count={spec.versions?.length ?? 0}>
        <div className="space-y-1.5">
          {(spec.versions ?? []).map((version: any) => (
            <div key={version.name} className="flex items-center gap-2 rounded-md border border-theme-border-subtle px-2 py-1.5 text-[12px]">
              <span className="font-mono text-theme-text-primary">{version.name}</span>
              {version.storage ? <span className="badge-sm status-neutral">storage</span> : null}
              {version.served ? <span className="badge-sm status-healthy">served</span> : <span className="badge-sm status-unknown">not served</span>}
              <span className="ml-auto text-[10px] text-theme-text-tertiary">
                {version.schema ? "schema" : "no schema"} · {version.additionalPrinterColumns?.length ?? 0} printer columns
              </span>
            </div>
          ))}
        </div>
      </DetailSection>
    </div>
  );
}

function HpaOverview({ object }: OverviewProps) {
  const spec = object.spec ?? {};
  const status = object.status ?? {};
  return (
    <div className="space-y-4">
      <DetailSection title="Autoscaling" icon={<Settings2 />}>
        <PropertyList>
          <Property label="Status" value={<StatusPill object={object} kind="HorizontalPodAutoscaler" />} />
          <Property label="Target" value={`${spec.scaleTargetRef?.kind}/${spec.scaleTargetRef?.name}`} />
          <Property label="Min replicas" value={spec.minReplicas ?? 1} />
          <Property label="Max replicas" value={spec.maxReplicas} />
          <Property label="Current replicas" value={status.currentReplicas ?? 0} />
          <Property label="Desired replicas" value={status.desiredReplicas ?? 0} />
          <Property label="Last scale" value={status.lastScaleTime ? formatTimestamp(status.lastScaleTime) : "–"} />
        </PropertyList>
      </DetailSection>
      <DetailSection title="Metrics" icon={<Cpu />} count={spec.metrics?.length ?? 0}>
        <div className="space-y-1">
          {(spec.metrics ?? []).map((metric: any, index: number) => (
            <div key={index} className="flex items-center gap-2 text-[12px]">
              <span className="badge-sm status-unknown">{metric.type}</span>
              <span className="text-theme-text-secondary">
                {metric.resource?.name ?? metric.pods?.metric?.name ?? metric.object?.metric?.name ?? "–"}
              </span>
              <span className="ml-auto font-mono text-[11px] text-theme-text-tertiary">
                {metric.resource?.target?.averageUtilization
                  ? `${metric.resource.target.averageUtilization}%`
                  : metric.resource?.target?.averageValue ?? "–"}
              </span>
            </div>
          ))}
        </div>
      </DetailSection>
      <DetailSection title="Conditions" icon={<ShieldCheck />}>
        <ConditionsList conditions={status.conditions ?? []} />
      </DetailSection>
    </div>
  );
}

function GenericOverview({ object, resource, onNavigate }: OverviewProps) {
  const status = (object.status ?? {}) as Record<string, unknown>;
  const spec = (object.spec ?? {}) as Record<string, unknown>;
  const metadata = object.metadata ?? {};

  return (
    <div className="space-y-4">
      <DetailSection title="Status" icon={<Info />}>
        {Object.keys(status).length ? (
          <NestedObject value={status} />
        ) : (
          <div className="text-xs text-theme-text-tertiary">This resource has no status fields.</div>
        )}
      </DetailSection>

      {object.status?.conditions ? (
        <DetailSection title="Conditions" icon={<ShieldCheck />} count={object.status.conditions.length}>
          <ConditionsList conditions={object.status.conditions} />
        </DetailSection>
      ) : null}

      <DetailSection title="Specification" icon={<Settings2 />} defaultOpen={Object.keys(spec).length <= 10}>
        {Object.keys(spec).length ? (
          <NestedObject value={spec} />
        ) : (
          <div className="text-xs text-theme-text-tertiary">This resource has no spec.</div>
        )}
      </DetailSection>

      <DetailSection title="Metadata" icon={<FileSliders />} defaultOpen={false}>
        <PropertyList>
          <Property label="Kind" value={resource.kind} />
          <Property label="API version" value={resource.apiVersion} mono />
          <Property label="UID" value={metadata.uid} mono copyable />
          <Property label="Created" value={formatTimestamp(metadata.creationTimestamp)} />
          <Property
            label="Owner"
            value={
              metadata.ownerReferences?.[0] ? (
                <ResourceLink
                  kind={metadata.ownerReferences[0].kind}
                  name={metadata.ownerReferences[0].name}
                  namespace={metadata.namespace}
                  onNavigate={onNavigate}
                />
              ) : (
                "–"
              )
            }
          />
        </PropertyList>
      </DetailSection>
    </div>
  );
}
