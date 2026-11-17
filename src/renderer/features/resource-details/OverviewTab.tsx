import { Ban, Box, Copy, Cpu, Database, Eye, EyeOff, FileSliders, Info, Network, Pause, Play, Plug, Scale, Server, Settings2, ShieldCheck } from "lucide-react";
import { Button } from "../../design-system/components/Button";
import { api, call, errorText } from "../../lib/api";
import { useState } from "react";
import type { ApiResourceInfo } from "@shared/types";
import { ConditionsList, DetailSection, KeyValueList, NestedObject, Property, PropertyList } from "./DetailSections";
import { formatAge, formatCpu, formatTimestamp, parseCpu, parseMemory } from "../../lib/format";
import { resourceStatus, toneClass } from "../../lib/status";
import { formatBytes } from "../../lib/format";
import { cn } from "../../lib/cn";
import { isDeploymentPaused, isSuspended, workloadCapabilities } from "../../lib/workload-actions";

type AnyObject = any;

export interface OverviewProps {
  object: AnyObject;
  resource: ApiResourceInfo;
  onNavigate: (kind: string, name: string, namespace?: string) => void;
  onPortForward?: (port: number) => void;
  onQuickPortForward?: (port: number) => void;
  onEditData?: () => void;
  onScale?: () => void;
  onTogglePause?: () => void;
  onToggleSuspend?: () => void;
  onToggleCordon?: () => void;
  clusterId: string;
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

function EnvReference({
  clusterId,
  namespace,
  kind,
  name,
  keyName,
  prefix,
}: {
  clusterId: string;
  namespace?: string;
  kind: "ConfigMap" | "Secret";
  name?: string;
  keyName?: string;
  prefix?: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!name) return <span className="text-xs text-theme-text-tertiary">–</span>;

  const load = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (value !== null || loading) return;
    setLoading(true);
    try {
      const object = await call(
        api.resources.get({
          clusterId,
          apiVersion: "v1",
          kind,
          namespace,
          name,
        }),
      );
      const data = (object.data ?? {}) as Record<string, string>;
      if (keyName) {
        const raw = data[keyName];
        if (raw === undefined) throw new Error(`Key "${keyName}" not found in ${kind}/${name}`);
        setValue(kind === "Secret" ? decodeSecret(raw) : raw);
      } else {
        const entries = Object.entries(data).map(([key, raw]) => {
          const display = kind === "Secret" ? decodeSecret(raw) : raw;
          return `${prefix ?? ""}${key} = ${display}`;
        });
        setValue(entries.join("\n") || "(empty)");
      }
      setError(null);
    } catch (loadError) {
      setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <span className="min-w-0 max-w-full">
      <span className="inline-flex max-w-full items-center gap-1">
        <span className="badge-sm status-unknown max-w-full truncate font-mono">
          {kind === "Secret" ? "secret" : "configMap"}/{name}
          {keyName ? `[${keyName}]` : ""}
        </span>
        <button
          type="button"
          className="shrink-0 rounded p-0.5 text-theme-text-tertiary hover:bg-theme-hover hover:text-theme-text-primary"
          title={`View ${kind === "Secret" ? "decoded secret" : "value"} without leaving the Pod`}
          onClick={() => void load()}
        >
          {open ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        </button>
      </span>
      {open ? (
        <div className="mt-1 w-full rounded-md border border-theme-border-subtle bg-theme-base p-2">
          {loading ? (
            <span className="text-[10px] text-theme-text-tertiary">Reading {kind}…</span>
          ) : error ? (
            <span className="text-[10px] text-red-500">{error}</span>
          ) : (
            <div className="flex items-start gap-2">
              <pre className="max-h-40 min-w-0 flex-1 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] text-theme-text-primary">
                {value}
              </pre>
              <button
                type="button"
                className="shrink-0 rounded p-0.5 text-theme-text-tertiary hover:bg-theme-hover hover:text-theme-text-primary"
                title="Copy value"
                onClick={() => void navigator.clipboard.writeText(value ?? "")}
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      ) : null}
    </span>
  );
}

function decodeSecret(value: string): string {
  try {
    const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return value;
  }
}

function PodOverview({ object, onNavigate, onPortForward, onQuickPortForward, clusterId }: OverviewProps) {
  const containerStatuses = [
    ...(object.status?.initContainerStatuses ?? []),
    ...(object.status?.containerStatuses ?? []),
  ] as Array<Record<string, any>>;
  const initContainers = (object.spec?.initContainers ?? []) as Array<Record<string, any>>;
  const mainContainers = (object.spec?.containers ?? []) as Array<Record<string, any>>;

  const renderContainer = (container: Record<string, any>, order: number, init: boolean) => {
    const status = containerStatuses.find((entry) => entry.name === container.name);
    const state = status?.state ?? {};
    const stateKey = Object.keys(state)[0] ?? "unknown";
    return (
      <div
        key={container.name}
        className={cn("card-inner-lg", init && "border-l-2 border-l-amber-500/60 pl-2.5")}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] text-theme-text-disabled">{order + 1}</span>
          <span className="text-[13px] font-medium text-theme-text-primary">{container.name}</span>
          {init ? <span className="badge-sm status-warning">init</span> : null}
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
  };

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

      {initContainers.length > 0 ? (
        <DetailSection title="Init containers" icon={<Box />} count={initContainers.length}>
          <div className="space-y-2">
            {initContainers.map((container, index) => renderContainer(container, index, true))}
          </div>
        </DetailSection>
      ) : null}

      <DetailSection title="Containers" icon={<Box />} count={mainContainers.length}>
        <div className="space-y-2">
          {mainContainers.map((container, index) => renderContainer(container, index, false))}
        </div>
      </DetailSection>

      {(() => {
        const containers = [
          ...((object.spec?.initContainers ?? []) as Array<Record<string, any>>),
          ...((object.spec?.containers ?? []) as Array<Record<string, any>>),
        ];
        const total = containers.reduce(
          (sum, container) => sum + (container.env?.length ?? 0) + (container.envFrom?.length ?? 0),
          0,
        );
        if (total === 0) return null;
        return (
          <DetailSection title="Environment" icon={<Settings2 />} defaultOpen={false} count={total}>
            <div className="space-y-2">
              {containers.map((container) => {
                const env = (container.env ?? []) as Array<Record<string, any>>;
                const envFrom = (container.envFrom ?? []) as Array<Record<string, any>>;
                if (env.length === 0 && envFrom.length === 0) return null;
                return (
                  <div key={container.name} className="card-inner">
                    <div className="mb-1 text-[12px] font-medium text-theme-text-primary">{container.name}</div>
                    {envFrom.map((entry, index) => (
                      <div key={`from-${index}`} className="flex flex-wrap items-center gap-2 py-0.5 text-[11px]">
                        <span className="w-40 shrink-0 text-theme-text-tertiary">envFrom</span>
                        <EnvReference
                          clusterId={clusterId}
                          namespace={object.metadata?.namespace}
                          kind={entry.configMapRef ? "ConfigMap" : "Secret"}
                          name={entry.configMapRef?.name ?? entry.secretRef?.name}
                          prefix={entry.prefix}
                        />
                      </div>
                    ))}
                    {env.map((entry) => {
                      const ref =
                        entry.valueFrom?.secretKeyRef
                          ? `secret/${entry.valueFrom.secretKeyRef.name}[${entry.valueFrom.secretKeyRef.key}]`
                          : entry.valueFrom?.configMapKeyRef
                            ? `configMap/${entry.valueFrom.configMapKeyRef.name}[${entry.valueFrom.configMapKeyRef.key}]`
                            : entry.valueFrom?.fieldRef
                              ? `fieldRef ${entry.valueFrom.fieldRef.fieldPath}`
                              : entry.valueFrom?.resourceFieldRef
                                ? `resource ${entry.valueFrom.resourceFieldRef.resource}`
                                : undefined;
                      return (
                        <div key={entry.name} className="flex items-start gap-2 py-0.5 text-[11px]">
                          <span className="w-40 shrink-0 truncate font-mono text-theme-text-tertiary" title={entry.name}>
                            {entry.name}
                          </span>
                          {entry.valueFrom?.secretKeyRef ? (
                            <EnvReference
                              clusterId={clusterId}
                              namespace={object.metadata?.namespace}
                              kind="Secret"
                              name={entry.valueFrom.secretKeyRef.name}
                              keyName={entry.valueFrom.secretKeyRef.key}
                            />
                          ) : entry.valueFrom?.configMapKeyRef ? (
                            <EnvReference
                              clusterId={clusterId}
                              namespace={object.metadata?.namespace}
                              kind="ConfigMap"
                              name={entry.valueFrom.configMapKeyRef.name}
                              keyName={entry.valueFrom.configMapKeyRef.key}
                            />
                          ) : ref ? (
                            <span className="badge-sm status-unknown max-w-full truncate font-mono">{ref}</span>
                          ) : (
                            <span
                              className="min-w-0 flex-1 truncate font-mono text-theme-text-primary"
                              title={entry.value}
                            >
                              {entry.value === "" ? '""' : entry.value}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </DetailSection>
        );
      })()}

      {(() => {
        const ports = ((object.spec?.containers ?? []) as Array<Record<string, any>>).flatMap((container) =>
          ((container.ports ?? []) as Array<Record<string, any>>).map((port) => ({
            container: container.name,
            name: port.name as string | undefined,
            port: Number(port.containerPort),
            protocol: (port.protocol as string) ?? "TCP",
          })),
        );
        if (ports.length === 0) return null;
        return (
          <DetailSection title="Ports" icon={<Network />} count={ports.length}>
            <div className="overflow-hidden rounded-md border border-theme-border">
              <div className="grid grid-cols-[1fr_1.2fr_90px_90px_110px] gap-2 border-b border-theme-border bg-theme-base px-2 py-1 text-[10px] uppercase tracking-wide text-theme-text-tertiary">
                <span>Container</span>
                <span>Name</span>
                <span>Port</span>
                <span>Protocol</span>
                <span />
              </div>
              {ports.map((port, index) => (
                <div
                  key={`${port.container}-${port.port}-${index}`}
                  className="grid grid-cols-[1fr_1.2fr_90px_90px_110px] items-center gap-2 border-b-subtle px-2 py-1.5 text-[11px] last:border-0"
                >
                  <span className="truncate font-mono text-theme-text-secondary">{port.container}</span>
                  <span className="truncate text-theme-text-secondary">{port.name ?? "—"}</span>
                  <button
                    type="button"
                    className="justify-self-start font-mono text-accent-text hover:underline"
                    title="Start an automatic local port forward"
                    onClick={() => onQuickPortForward?.(port.port)}
                  >
                    {port.port}
                  </button>
                  <span className="text-theme-text-secondary">{port.protocol}</span>
                  <Button size="xs" variant="ghost" onClick={() => onPortForward?.(port.port)}>
                    <Plug className="h-3 w-3" />
                    Forward
                  </Button>
                </div>
              ))}
            </div>
          </DetailSection>
        );
      })()}

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

      <DetailSection title="Scheduling" icon={<Settings2 />} defaultOpen={false}>
        <PropertyList>
          <Property
            label="Node selector"
            value={
              Object.keys(object.spec?.nodeSelector ?? {}).length ? (
                <span className="flex flex-wrap gap-1">
                  {Object.entries(object.spec.nodeSelector as Record<string, string>).map(([key, value]) => (
                    <span key={key} className="badge-sm status-unknown font-mono">
                      {key}={value}
                    </span>
                  ))}
                </span>
              ) : (
                "–"
              )
            }
          />
          <Property label="Priority class" value={object.spec?.priorityClassName ?? "–"} />
        </PropertyList>
      </DetailSection>

      <DetailSection title="Tolerations" icon={<ShieldCheck />} defaultOpen={false} count={object.spec?.tolerations?.length ?? 0}>
        {(object.spec?.tolerations ?? []).length === 0 ? (
          <div className="text-xs text-theme-text-tertiary">No tolerations.</div>
        ) : (
          <div className="space-y-1">
            {(object.spec.tolerations as Array<Record<string, any>>).map((toleration, index) => (
              <div
                key={`${toleration.key ?? "*"}-${index}`}
                className="grid grid-cols-[minmax(0,1.4fr)_84px_minmax(0,1fr)_96px] items-center gap-2 rounded-md border border-theme-border-subtle bg-theme-base px-2 py-1 text-[11px]"
              >
                <span className="truncate font-mono text-theme-text-primary" title={toleration.key}>
                  {toleration.key ?? "*"}
                </span>
                <span className="text-theme-text-tertiary">{toleration.operator ?? "Equal"}</span>
                <span className="truncate font-mono text-theme-text-secondary" title={toleration.value}>
                  {toleration.value ?? "–"}
                </span>
                <span className="badge-sm status-unknown justify-self-start">{toleration.effect ?? "All"}</span>
              </div>
            ))}
          </div>
        )}
      </DetailSection>

      <DetailSection title="Affinity" icon={<Settings2 />} defaultOpen={false} count={object.spec?.affinity ? 1 : 0}>
        <AffinityView affinity={object.spec?.affinity} />
      </DetailSection>
    </div>
  );
}

function WorkloadOverview({ object, onNavigate, onScale, onTogglePause }: OverviewProps) {
  const spec = object.spec ?? {};
  const status = object.status ?? {};
  const containers = (spec.template?.spec?.containers ?? []) as Array<Record<string, any>>;
  const caps = workloadCapabilities(object.kind, object.apiVersion);
  const paused = isDeploymentPaused(object);

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
        {caps.scalable || caps.pausable ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-theme-border-subtle pt-2.5">
            {caps.scalable ? (
              <button
                type="button"
                className="flex h-7 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 text-[11px] font-medium text-emerald-600 transition-colors hover:bg-emerald-500/15 dark:text-emerald-400"
                onClick={onScale}
              >
                <Scale className="h-3 w-3" />
                Scale
              </button>
            ) : null}
            {caps.pausable ? (
              <button
                type="button"
                className="flex h-7 items-center gap-1.5 rounded-lg border border-theme-border-light bg-theme-elevated px-2.5 text-[11px] font-medium text-theme-text-secondary transition-colors hover:bg-theme-hover hover:text-theme-text-primary"
                onClick={onTogglePause}
              >
                {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                {paused ? "Resume rollout" : "Pause rollout"}
              </button>
            ) : null}
          </div>
        ) : null}
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

      <DetailSection title="Ownership" icon={<Server />} defaultOpen={false}>
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
        </PropertyList>
      </DetailSection>
    </div>
  );
}

function JobOverview({ object, onToggleSuspend }: OverviewProps) {
  const isCron = object.kind === "CronJob";
  const status = object.status ?? {};
  const spec = object.spec ?? {};
  const suspended = isSuspended(object);

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
              <Property label="Suspended" value={suspended ? "Yes" : "No"} />
              <Property label="Started" value={status.startTime ? formatTimestamp(status.startTime) : "–"} />
              <Property label="Completed" value={status.completionTime ? formatTimestamp(status.completionTime) : "–"} />
            </>
          )}
          <Property label="Age" value={formatAge(object.metadata?.creationTimestamp)} />
        </PropertyList>
        {onToggleSuspend ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-theme-border-subtle pt-2.5">
            <button
              type="button"
              className="flex h-7 items-center gap-1.5 rounded-lg border border-theme-border-light bg-theme-elevated px-2.5 text-[11px] font-medium text-theme-text-secondary transition-colors hover:bg-theme-hover hover:text-theme-text-primary"
              onClick={onToggleSuspend}
            >
              {suspended ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
              {suspended ? "Resume" : "Suspend"}
            </button>
          </div>
        ) : null}
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

function DataOverview({ object, onEditData }: OverviewProps) {
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
      <DetailSection
        title="Data"
        icon={<Database />}
        count={Object.keys(data).length}
        actions={
          <Button size="xs" variant="secondary" onClick={() => onEditData?.()}>
            Edit
          </Button>
        }
      >
        <KeyValueList data={data as Record<string, string>} secret={isSecret} />
      </DetailSection>
    </div>
  );
}

function NodeOverview({ object, onToggleCordon }: OverviewProps) {
  const status = object.status ?? {};
  const capacity = status.capacity ?? {};
  const allocatable = status.allocatable ?? {};
  const info = status.nodeInfo ?? {};
  const cordoned = object.spec?.unschedulable === true;
  const roles = Object.keys(object.metadata?.labels ?? {})
    .filter((key) => key.startsWith("node-role.kubernetes.io/"))
    .map((key) => key.replace("node-role.kubernetes.io/", ""));

  return (
    <div className="space-y-4">
      <DetailSection title="Status" icon={<Server />}>
        <PropertyList>
          <Property label="Status" value={<StatusPill object={object} kind="Node" />} />
          <Property label="Schedulable" value={cordoned ? "No (cordoned)" : "Yes"} />
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
        {onToggleCordon ? (
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
        ) : null}
      </DetailSection>

      <DetailSection title="Capacity" icon={<Cpu />}>
        <div className="grid grid-cols-2 gap-2">
          {[
            { key: "cpu", label: "CPU", icon: <Cpu className="h-3.5 w-3.5" /> },
            { key: "memory", label: "Memory", icon: <Database className="h-3.5 w-3.5" /> },
            { key: "pods", label: "Pods", icon: <Box className="h-3.5 w-3.5" /> },
            { key: "ephemeral-storage", label: "Storage", icon: <Server className="h-3.5 w-3.5" /> },
          ].map((entry) => {
            const cap = capacity[entry.key];
            const alloc = allocatable[entry.key];
            const show = (value: string | number | undefined) => {
              if (value === undefined || value === null || value === "") return "–";
              if (entry.key === "cpu") return formatCpu(parseCpu(value));
              if (entry.key === "memory" || entry.key === "ephemeral-storage") {
                return formatBytes(parseMemory(value));
              }
              return String(value);
            };
            const ratio =
              entry.key === "cpu"
                ? (parseCpu(alloc) ?? 0) / Math.max(1, parseCpu(cap) ?? 1)
                : entry.key === "memory"
                  ? (parseMemory(alloc) ?? 0) / Math.max(1, parseMemory(cap) ?? 1)
                  : entry.key === "pods"
                    ? (Number(alloc) || 0) / Math.max(1, Number(cap) || 1)
                    : null;
            return (
              <div key={entry.key} className="card-inner">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-theme-text-tertiary">
                  {entry.icon}
                  {entry.label}
                </div>
                <div className="mt-1 font-mono text-[15px] font-semibold text-theme-text-primary">
                  {show(cap)}
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-theme-text-tertiary">
                  allocatable {show(alloc)}
                </div>
                {ratio !== null ? (
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-theme-elevated">
                    <div
                      className="h-full rounded-full bg-skyhook-500"
                      style={{ width: `${Math.min(100, ratio * 100)}%` }}
                    />
                  </div>
                ) : null}
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
  const spec = (object.spec ?? {}) as Record<string, any>;
  const status = (object.status ?? {}) as Record<string, any>;
  const names = (spec.names ?? {}) as Record<string, any>;
  const versions = (spec.versions ?? []) as Array<Record<string, any>>;
  const stored = versions.find((version) => version.storage);
  const primary = stored ?? versions[0];
  const conditions = (status.conditions ?? []) as Array<Record<string, any>>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Group", value: spec.group ?? "–" },
          { label: "Kind", value: names.kind ?? "–" },
          { label: "Scope", value: spec.scope ?? "–" },
          { label: "Versions", value: String(versions.length) },
        ].map((card) => (
          <div key={card.label} className="card-inner">
            <div className="text-[10px] uppercase tracking-wide text-theme-text-tertiary">{card.label}</div>
            <div className="mt-0.5 truncate font-mono text-[13px] font-semibold text-theme-text-primary" title={card.value}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      <DetailSection title="Definition" icon={<Settings2 />}>
        <PropertyList>
          <Property label="Group / version" value={`${spec.group ?? "–"}/${primary?.name ?? "–"}`} mono copyable />
          <Property label="Scope" value={spec.scope === "Namespaced" ? "Namespaced" : "Cluster-scoped"} />
          <Property label="Plural" value={names.plural} mono />
          <Property label="Singular" value={names.singular} mono />
          <Property label="Short names" value={(names.shortNames ?? []).join(", ") || "–"} />
          <Property label="Categories" value={(names.categories ?? []).join(", ") || "–"} />
          <Property label="Conversion" value={spec.conversion?.strategy ?? "None"} />
          <Property label="Preserve unknown fields" value={spec.preserveUnknownFields ? "Yes" : "No"} />
          <Property label="Age" value={formatAge(object.metadata?.creationTimestamp)} />
        </PropertyList>
      </DetailSection>

      <DetailSection title="Versions" icon={<Database />} count={versions.length}>
        <div className="space-y-1.5">
          {versions.map((version) => (
            <div key={version.name} className="rounded-md border border-theme-border-subtle bg-theme-base p-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[12px] font-medium text-theme-text-primary">{version.name}</span>
                {version.storage ? <span className="badge-sm status-neutral">storage</span> : null}
                {version.served ? (
                  <span className="badge-sm status-healthy">served</span>
                ) : (
                  <span className="badge-sm status-unknown">not served</span>
                )}
                <span className="ml-auto text-[10px] text-theme-text-tertiary">
                  {version.schema ? "OpenAPI schema" : "no schema"} ·{" "}
                  {version.additionalPrinterColumns?.length ?? 0} printer columns
                </span>
              </div>
              {version.additionalPrinterColumns?.length ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {version.additionalPrinterColumns.map((column: any) => (
                    <span key={column.name} className="badge-sm status-unknown font-mono" title={column.jsonPath}>
                      {column.name}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </DetailSection>

      <DetailSection title="Conditions" icon={<ShieldCheck />} count={conditions.length} defaultOpen={false}>
        {conditions.length ? (
          <ConditionsList conditions={conditions} />
        ) : (
          <div className="text-xs text-theme-text-tertiary">No conditions reported by the API.</div>
        )}
      </DetailSection>

      <DetailSection
        title="Printer columns"
        icon={<FileSliders />}
        count={versions.reduce((sum, version) => sum + (version.additionalPrinterColumns?.length ?? 0), 0)}
        defaultOpen={false}
      >
        <div className="space-y-2">
          {versions.map((version) =>
            version.additionalPrinterColumns?.length ? (
              <div key={version.name}>
                <div className="mb-1 font-mono text-[10px] text-theme-text-tertiary">{version.name}</div>
                <div className="overflow-hidden rounded-md border border-theme-border">
                  <div className="grid grid-cols-[1.2fr_0.7fr_1.8fr_60px] border-b border-theme-border bg-theme-base px-2 py-1 text-[9px] uppercase tracking-wide text-theme-text-tertiary">
                    <span>Name</span>
                    <span>Type</span>
                    <span>JSON path</span>
                    <span className="text-right">Priority</span>
                  </div>
                  {version.additionalPrinterColumns.map((column: any) => (
                    <div
                      key={column.name}
                      className="grid grid-cols-[1.2fr_0.7fr_1.8fr_60px] items-center border-b-subtle px-2 py-1 text-[10px] last:border-0"
                    >
                      <span className="truncate text-theme-text-primary">{column.name}</span>
                      <span className="text-theme-text-tertiary">{column.type}</span>
                      <span className="truncate font-mono text-theme-text-secondary" title={column.jsonPath}>
                        {column.jsonPath}
                      </span>
                      <span className="text-right font-mono text-theme-text-tertiary">{column.priority ?? 0}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null,
          )}
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

function MatchExpressions({ selector }: { selector: any }) {
  const labels = Object.entries(selector?.matchLabels ?? {}) as Array<[string, string]>;
  const expressions = (selector?.matchExpressions ?? []) as Array<Record<string, any>>;
  const fields = (selector?.matchFields ?? []) as Array<Record<string, any>>;
  if (labels.length === 0 && expressions.length === 0 && fields.length === 0) {
    return <span className="text-[11px] text-theme-text-tertiary">any</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {labels.map(([key, value]) => (
        <span key={key} className="badge-sm status-unknown max-w-full truncate font-mono">
          {key}={value}
        </span>
      ))}
      {expressions.map((expression, index) => (
        <span key={`${expression.key}-${index}`} className="badge-sm status-unknown max-w-full truncate font-mono">
          {expression.key} {expression.operator}
          {expression.values?.length ? ` (${expression.values.join(", ")})` : ""}
        </span>
      ))}
      {fields.map((field, index) => (
        <span key={`field-${field.key}-${index}`} className="badge-sm status-unknown max-w-full truncate font-mono">
          field:{field.key} {field.operator}
          {field.values?.length ? ` (${field.values.join(", ")})` : ""}
        </span>
      ))}
    </div>
  );
}

function AffinityView({ affinity }: { affinity: any }) {
  if (!affinity) return <div className="text-xs text-theme-text-tertiary">No affinity rules.</div>;

  const node = affinity.nodeAffinity;
  const pod = affinity.podAffinity;
  const anti = affinity.podAntiAffinity;
  const requiredTerms = node?.requiredDuringSchedulingIgnoredDuringExecution?.nodeSelectorTerms ?? [];
  const preferredTerms = node?.preferredDuringSchedulingIgnoredDuringExecution ?? [];

  const renderPodTerms = (terms: any[], label: string) => {
    if (!terms?.length) return null;
    return (
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-theme-text-tertiary">{label}</div>
        <div className="space-y-1">
          {terms.map((term, index) => {
            const affinityTerm = term.podAffinityTerm ?? term;
            return (
              <div key={index} className="rounded-md border border-theme-border-subtle bg-theme-base p-2 text-[11px]">
                <div className="flex flex-wrap items-center gap-2 text-theme-text-secondary">
                  {term.weight !== undefined ? <span className="badge-sm status-neutral">weight {term.weight}</span> : null}
                  <span>
                    topology: <span className="font-mono text-theme-text-primary">{affinityTerm.topologyKey ?? "–"}</span>
                  </span>
                  {affinityTerm.namespaces?.length ? (
                    <span className="truncate text-theme-text-tertiary">namespaces: {affinityTerm.namespaces.join(", ")}</span>
                  ) : null}
                </div>
                <div className="mt-1">
                  <MatchExpressions selector={affinityTerm.labelSelector} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3 text-[11px]">
      {requiredTerms.length > 0 ? (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-theme-text-tertiary">
            Node affinity · required
          </div>
          <div className="space-y-1">
            {requiredTerms.map((term: any, index: number) => (
              <div key={index} className="rounded-md border border-theme-border-subtle bg-theme-base p-2">
                <MatchExpressions selector={{ matchExpressions: term.matchExpressions, matchFields: term.matchFields }} />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {preferredTerms.length > 0 ? (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-theme-text-tertiary">
            Node affinity · preferred
          </div>
          <div className="space-y-1">
            {preferredTerms.map((term: any, index: number) => (
              <div key={index} className="flex flex-wrap items-center gap-2 rounded-md border border-theme-border-subtle bg-theme-base p-2">
                <span className="badge-sm status-neutral">weight {term.weight}</span>
                <MatchExpressions selector={{ matchExpressions: term.preference?.matchExpressions, matchFields: term.preference?.matchFields }} />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {renderPodTerms(pod?.requiredDuringSchedulingIgnoredDuringExecution, "Pod affinity · required")}
      {renderPodTerms(pod?.preferredDuringSchedulingIgnoredDuringExecution, "Pod affinity · preferred")}
      {renderPodTerms(anti?.requiredDuringSchedulingIgnoredDuringExecution, "Pod anti-affinity · required")}
      {renderPodTerms(anti?.preferredDuringSchedulingIgnoredDuringExecution, "Pod anti-affinity · preferred")}

      {requiredTerms.length === 0 && preferredTerms.length === 0 && !pod && !anti ? (
        <div className="text-xs text-theme-text-tertiary">No affinity rules.</div>
      ) : null}
    </div>
  );
}

function readJsonPath(value: unknown, path: string): unknown {
  const clean = path.replace(/^\./, "");
  return clean.split(".").reduce<unknown>((current, key) => {
    if (current === null || current === undefined) return undefined;
    if (key.includes("[")) {
      const [name, indexPart] = key.split("[");
      const index = Number(indexPart?.replace("]", ""));
      const container = (current as Record<string, unknown>)[name] as unknown[] | undefined;
      return container?.[index];
    }
    return (current as Record<string, unknown>)[key];
  }, value);
}

function GenericOverview({ object, resource, onNavigate }: OverviewProps) {
  const status = (object.status ?? {}) as Record<string, unknown>;
  const spec = (object.spec ?? {}) as Record<string, unknown>;
  const metadata = object.metadata ?? {};
  const printerColumns = (resource.printerColumns ?? []) as Array<{
    name: string;
    jsonPath?: string;
    type?: string;
  }>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Kind", value: resource.kind },
          { label: "API version", value: resource.apiVersion },
          { label: "Namespace", value: metadata.namespace ?? "cluster-scoped" },
          { label: "Age", value: formatAge(metadata.creationTimestamp) },
        ].map((card) => (
          <div key={card.label} className="card-inner">
            <div className="text-[10px] uppercase tracking-wide text-theme-text-tertiary">{card.label}</div>
            <div className="mt-0.5 truncate font-mono text-[12px] font-semibold text-theme-text-primary" title={card.value}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      <DetailSection title="Details" icon={<FileSliders />}>
        <PropertyList>
          <Property label="Name" value={metadata.name} copyable mono />
          <Property label="Namespace" value={metadata.namespace ?? "cluster-scoped"} copyable />
          <Property label="Created" value={formatTimestamp(metadata.creationTimestamp)} />
          <Property label="Labels" value={Object.keys(metadata.labels ?? {}).length} />
          <Property label="Annotations" value={Object.keys(metadata.annotations ?? {}).length} />
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

      {printerColumns.length ? (
        <DetailSection title="Printer columns" icon={<Settings2 />} count={printerColumns.length}>
          <div className="overflow-hidden rounded-md border border-theme-border">
            {printerColumns.map((column) => {
              const value = column.jsonPath ? readJsonPath(object, column.jsonPath) : undefined;
              return (
                <div
                  key={column.name}
                  className="grid grid-cols-[140px_1fr] items-center border-b-subtle px-2 py-1 text-[11px] last:border-0"
                >
                  <span className="truncate text-theme-text-tertiary">{column.name}</span>
                  <span className="truncate font-mono text-theme-text-primary" title={String(value ?? "")}>
                    {value === undefined || value === null || value === ""
                      ? "–"
                      : typeof value === "object"
                        ? JSON.stringify(value)
                        : String(value)}
                  </span>
                </div>
              );
            })}
          </div>
        </DetailSection>
      ) : null}

      {status.conditions ? (
        <DetailSection title="Conditions" icon={<ShieldCheck />} count={(status.conditions as unknown[]).length}>
          <ConditionsList conditions={status.conditions as Array<Record<string, any>>} />
        </DetailSection>
      ) : null}

      <DetailSection title="Status" icon={<Info />}>
        {Object.keys(status).length ? (
          <NestedObject value={status} />
        ) : (
          <div className="text-xs text-theme-text-tertiary">This resource has no status fields.</div>
        )}
      </DetailSection>

      <DetailSection title="Specification" icon={<Settings2 />} defaultOpen={Object.keys(spec).length <= 10}>
        {Object.keys(spec).length ? (
          <NestedObject value={spec} />
        ) : (
          <div className="text-xs text-theme-text-tertiary">This resource has no spec.</div>
        )}
      </DetailSection>
    </div>
  );
}
