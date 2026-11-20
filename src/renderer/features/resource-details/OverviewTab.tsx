import { Box, Copy, Cpu, Database, Eye, EyeOff, FileSliders, FolderTree, Info, Layers, Network, Pause, Play, Plug, Server, Settings2, ShieldCheck } from "lucide-react";
import { Button } from "../../design-system/components/Button";
import { Tooltip } from "../../design-system/components/Tooltip";
import { api, call, errorText } from "../../lib/api";
import { useState } from "react";
import type { ApiResourceInfo } from "@shared/types";
import { ConditionsList, DetailSection, KeyValueList, NestedObject, Property, PropertyList, AgeProperty } from "./DetailSections";
import { ContainerLaunchParams } from "./ContainerLaunchParams";
import { formatAge, formatCpu, formatTimestamp, parseCpu, parseMemory } from "../../lib/format";
import { resourceStatus, toneClass } from "../../lib/status";
import { ConditionsTooltip } from "../../lib/columns";
import { formatBytes } from "../../lib/format";
import { cn } from "../../lib/cn";
import { isSuspended } from "../../lib/workload-actions";
import { daysUntil, parseCertificate } from "../../lib/certificate";
import { readJsonPath } from "../../lib/jsonpath";
import { NodeOverview } from "./NodeOverview";
import { PermissionsSection } from "./PermissionsSection";
import { PolicySection } from "./PolicySection";
import { HelmReleaseOverview } from "./HelmReleaseOverview";
import { useClaimObjects } from "./useDetailsData";
import { ServiceOverview } from "./ServiceOverview";
import { StorageOverview } from "./StorageOverview";
import { NetworkPolicyOverview } from "./NetworkPolicyOverview";
import {
  RoleBindingRbacSections,
  RoleBindingsSection,
  RoleRbacSections,
  ServiceAccountExtras,
  ServiceAccountRbacSections,
} from "./RbacOverview";

type AnyObject = any;

export interface OverviewProps {
  object: AnyObject;
  resource: ApiResourceInfo;
  onNavigate: (kind: string, name: string, namespace?: string, apiVersion?: string) => void;
  onPortForward?: (port: number) => void;
  onQuickPortForward?: (port: number) => void;
  onEditData?: () => void;
  onScale?: () => void;
  onTogglePause?: () => void;
  onToggleSuspend?: () => void;
  onToggleCordon?: () => void;
  /** Re-fetches the drawer's object (used after a Helm rollback). */
  onRefresh?: () => void;
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
    <Tooltip content={name} side="bottom" delay={140} wrapperClassName="min-w-0">
      <button
        type="button"
        className="min-w-0 truncate text-accent-text hover:underline"
        onClick={() => onNavigate(kind, name, namespace)}
      >
        {name}
      </button>
    </Tooltip>
  );
}

function StatusPill({ object, kind }: { object: AnyObject; kind: string }) {
  const status = resourceStatus(object, kind);
  const conditions = (object.status?.conditions ?? []) as Array<Record<string, any>>;
  const badge = <span className={`badge ${toneClass(status.tone)}`}>{status.text}</span>;
  if (!status.detail && conditions.length === 0) return badge;
  return (
    <Tooltip
      wrapperClassName="min-w-0"
      content={
        <div className="max-w-xs space-y-1.5">
          <div className="font-medium text-theme-text-primary">{status.text}</div>
          {status.detail ? (
            <div className="whitespace-pre-wrap break-words text-theme-text-secondary">{status.detail}</div>
          ) : null}
          {conditions.length > 0 ? (
            <>
              <div className="pt-0.5 text-[calc(10px*var(--font-scale))] uppercase tracking-wide text-theme-text-disabled">
                Conditions
              </div>
              <ConditionsTooltip conditions={conditions} />
            </>
          ) : null}
        </div>
      }
    >
      {badge}
    </Tooltip>
  );
}

export function OverviewTab(props: OverviewProps) {
  // CRDs may reuse a built-in kind name (MetalMonk's `Node`); their spec/status
  // is not a Kubernetes node, so they open the generic overview.
  const kind = props.resource.isCrd ? "" : props.resource.kind.toLowerCase();
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
    case "serviceaccount":
      return <ServiceAccountOverview {...props} />;
    case "helmrelease":
      return <HelmReleaseOverview {...props} />;
    case "role":
    case "clusterrole":
      return <RoleOverview {...props} />;
    case "rolebinding":
    case "clusterrolebinding":
      return <RoleBindingOverview {...props} />;
    case "namespace":
      return <NamespaceOverview {...props} />;
    case "event":
      return <EventOverview {...props} />;
    case "persistentvolumeclaim":
    case "persistentvolume":
    case "storageclass":
      return <StorageOverview {...props} />;
    case "networkpolicy":
      return <NetworkPolicyOverview {...props} />;
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
            <span className="text-[calc(10px*var(--font-scale))] text-theme-text-tertiary">Reading {kind}…</span>
          ) : error ? (
            <span className="text-[calc(10px*var(--font-scale))] text-red-500">{error}</span>
          ) : (
            <div className="flex items-start gap-2">
              <pre className="max-h-40 min-w-0 flex-1 overflow-auto whitespace-pre-wrap break-all font-mono text-[calc(10px*var(--font-scale))] text-theme-text-primary">
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
  const claimNames = [
    ...new Set(
      ((object.spec?.volumes ?? []) as Array<Record<string, any>>)
        .map((volume) => volume.persistentVolumeClaim?.claimName as string | undefined)
        .filter((name): name is string => Boolean(name)),
    ),
  ];
  const claimObjects = useClaimObjects(clusterId, object.metadata?.namespace, claimNames);

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
          <span className="font-mono text-[calc(10px*var(--font-scale))] text-theme-text-disabled">{order + 1}</span>
          <span className="text-[calc(13px*var(--font-scale))] font-medium text-theme-text-primary">{container.name}</span>
          {init ? <span className="badge-sm status-warning">init</span> : null}
          <span
            className={`badge-sm ${toneClass(
              status?.ready ? "success" : stateKey === "waiting" ? "warning" : "error",
            )}`}
          >
            {status?.ready ? "Ready" : stateKey === "waiting" ? (state.waiting?.reason ?? "Waiting") : stateKey}
          </span>
          {status?.restartCount ? (
            <Tooltip content={`${status.restartCount} container restart${status.restartCount === 1 ? "" : "s"}`} side="bottom" delay={140}>
              <span className="badge-sm status-unknown">{status.restartCount} restarts</span>
            </Tooltip>
          ) : null}
        </div>
        <div className="mt-1.5 break-all font-mono text-[calc(10px*var(--font-scale))] text-theme-text-secondary">
          {container.image}
        </div>
        <ContainerLaunchParams container={container} />
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[calc(11px*var(--font-scale))]">
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
          <div className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[calc(11px*var(--font-scale))] text-amber-700 dark:text-amber-300">
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
          <AgeProperty timestamp={object.metadata?.creationTimestamp} />
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
                    <div className="mb-1 text-[calc(12px*var(--font-scale))] font-medium text-theme-text-primary">{container.name}</div>
                    {envFrom.map((entry, index) => (
                      <div key={`from-${index}`} className="flex flex-wrap items-center gap-2 py-0.5 text-[calc(11px*var(--font-scale))]">
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
                        <div key={entry.name} className="flex items-start gap-2 py-0.5 text-[calc(11px*var(--font-scale))]">
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
              <div className="grid grid-cols-[1fr_1.2fr_90px_90px_110px] gap-2 border-b border-theme-border bg-theme-base px-2 py-1 text-[calc(10px*var(--font-scale))] uppercase tracking-wide text-theme-text-tertiary">
                <span>Container</span>
                <span>Name</span>
                <span>Port</span>
                <span>Protocol</span>
                <span />
              </div>
              {ports.map((port, index) => (
                <div
                  key={`${port.container}-${port.port}-${index}`}
                  className="grid grid-cols-[1fr_1.2fr_90px_90px_110px] items-center gap-2 border-b-subtle px-2 py-1.5 text-[calc(11px*var(--font-scale))] last:border-0"
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
            (object.spec.volumes as Array<Record<string, any>>).map((volume) => {
              const namespace = object.metadata?.namespace as string | undefined;
              const configMapName = volume.configMap?.name as string | undefined;
              const secretName = volume.secret?.secretName as string | undefined;
              const claimName = volume.persistentVolumeClaim?.claimName as string | undefined;
              const claim = claimName ? claimObjects.byName.get(claimName) : undefined;
              const claimStatus = claim ? resourceStatus(claim, "PersistentVolumeClaim") : null;
              const claimCapacity = (claim?.status as any)?.capacity?.storage as string | undefined;
              const projectedSources = (volume.projected?.sources ?? []) as Array<Record<string, any>>;
              const label = volume.configMap
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
                          : Object.keys(volume).find((key) => key !== "name") ?? "–";
              const link = (kind: string, name: string, text: string) => (
                <button
                  type="button"
                  className="truncate text-left text-accent-text hover:underline"
                  title={`Open ${kind} ${name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onNavigate(kind, name, namespace);
                  }}
                >
                  {text}
                </button>
              );
              return (
                <div key={volume.name} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[calc(12px*var(--font-scale))]">
                  <span className="w-40 shrink-0 truncate font-mono text-[calc(11px*var(--font-scale))] text-theme-text-tertiary">
                    {volume.name}
                  </span>
                  {configMapName ? (
                    link("ConfigMap", configMapName, `configMap/${configMapName}`)
                  ) : secretName ? (
                    link("Secret", secretName, `secret/${secretName}`)
                  ) : volume.persistentVolumeClaim && claimName ? (
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      {link("PersistentVolumeClaim", claimName, `pvc/${claimName}`)}
                      {claimStatus ? (
                        <span className={cn("badge-sm", toneClass(claimStatus.tone))} title={claimStatus.detail}>
                          {claimStatus.text}
                        </span>
                      ) : claimObjects.error ? (
                        <span className="badge-sm status-unknown" title={claimObjects.error}>
                          status unavailable
                        </span>
                      ) : claimObjects.loading ? (
                        <span className="text-[calc(11px*var(--font-scale))] text-theme-text-tertiary">loading…</span>
                      ) : (
                        <span className="badge-sm status-unknown">not found</span>
                      )}
                      {claimCapacity ? (
                        <span className="font-mono text-[calc(11px*var(--font-scale))] text-theme-text-tertiary">
                          {claimCapacity}
                        </span>
                      ) : null}
                    </span>
                  ) : volume.projected ? (
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-theme-text-secondary">
                      projected
                      {projectedSources.map((source, index) =>
                        source.configMap?.name ? (
                          link("ConfigMap", source.configMap.name, `configMap/${source.configMap.name}${projectedSources.length > 1 ? ` [${index + 1}]` : ""}`)
                        ) : source.secret?.name ? (
                          link("Secret", source.secret.name, `secret/${source.secret.name}${projectedSources.length > 1 ? ` [${index + 1}]` : ""}`)
                        ) : null,
                      )}
                    </span>
                  ) : (
                    <span className="truncate text-theme-text-secondary">{label}</span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </DetailSection>

      {(() => {
        const containers = [
          ...((object.spec?.initContainers ?? []) as Array<Record<string, any>>).map((container) => ({
            container,
            init: true,
          })),
          ...((object.spec?.containers ?? []) as Array<Record<string, any>>).map((container) => ({
            container,
            init: false,
          })),
        ];
        const mountCount = containers.reduce(
          (sum, entry) => sum + (entry.container.volumeMounts?.length ?? 0),
          0,
        );
        return (
          <DetailSection
            title="Volume mounts"
            icon={<FolderTree />}
            defaultOpen={false}
            count={mountCount}
          >
            {mountCount === 0 ? (
              <div className="text-xs text-theme-text-tertiary">No volume mounts.</div>
            ) : (
              <div className="space-y-2">
                {containers
                  .filter((entry) => (entry.container.volumeMounts ?? []).length > 0)
                  .map(({ container, init }) => (
                    <div key={`${init ? "init" : "app"}-${container.name}`}>
                      <div className="mb-1 flex items-center gap-2 text-[calc(11px*var(--font-scale))] font-medium text-theme-text-primary">
                        <span className="truncate font-mono">{container.name}</span>
                        {init ? <span className="badge-sm status-unknown">init</span> : null}
                      </div>
                      <div className="space-y-0.5">
                        {(container.volumeMounts as Array<Record<string, any>>).map((mount) => (
                          <div
                            key={`${container.name}-${mount.mountPath}`}
                            className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md bg-theme-base px-2 py-1 font-mono text-[calc(11px*var(--font-scale))]"
                          >
                            <span
                              className="min-w-0 flex-1 truncate text-theme-text-primary"
                              title={mount.mountPath}
                            >
                              {mount.mountPath}
                            </span>
                            <span className="shrink-0 text-theme-text-tertiary">← {mount.name}</span>
                            {mount.subPath ? (
                              <span className="shrink-0 text-theme-text-disabled">
                                subPath: {mount.subPath}
                              </span>
                            ) : null}
                            {mount.readOnly ? (
                              <span className="badge-sm status-unknown shrink-0">ro</span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </DetailSection>
        );
      })()}

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
                className="grid grid-cols-[minmax(0,1.4fr)_84px_minmax(0,1fr)_96px] items-center gap-2 rounded-md border border-theme-border-subtle bg-theme-base px-2 py-1 text-[calc(11px*var(--font-scale))]"
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

      <PermissionsSection
        clusterId={clusterId}
        namespace={object.metadata?.namespace}
        saName={object.spec?.serviceAccountName ?? "default"}
        variant="pod"
        onNavigate={onNavigate}
      />

      <PolicySection
        clusterId={clusterId}
        kind={object.kind}
        namespace={object.metadata?.namespace}
        name={object.metadata?.name ?? ""}
      />
    </div>
  );
}

function WorkloadOverview({ object, onNavigate, clusterId }: OverviewProps) {
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
          <AgeProperty timestamp={object.metadata?.creationTimestamp} />
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
                <span className="text-[calc(13px*var(--font-scale))] font-medium text-theme-text-primary">{container.name}</span>
              </div>
              <div className="mt-1 break-all font-mono text-[calc(10px*var(--font-scale))] text-theme-text-tertiary">{container.image}</div>
              <ContainerLaunchParams container={container} />
              <div className="mt-1.5 flex flex-wrap gap-3 text-[calc(11px*var(--font-scale))] text-theme-text-tertiary">
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

      <PermissionsSection
        clusterId={clusterId}
        namespace={object.metadata?.namespace}
        saName={object.spec?.template?.spec?.serviceAccountName ?? "default"}
        variant="workload"
        onNavigate={onNavigate}
      />

      <PolicySection
        clusterId={clusterId}
        kind={object.kind}
        namespace={object.metadata?.namespace}
        name={object.metadata?.name ?? ""}
      />
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
          <AgeProperty timestamp={object.metadata?.creationTimestamp} />
        </PropertyList>
        {onToggleSuspend ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-theme-border-subtle pt-2.5">
            <button
              type="button"
              className="flex h-7 items-center gap-1.5 rounded-lg border border-theme-border-light bg-theme-elevated px-2.5 text-[calc(11px*var(--font-scale))] font-medium text-theme-text-secondary transition-colors hover:bg-theme-hover hover:text-theme-text-primary"
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

function ServiceAccountOverview({ object, clusterId, onNavigate }: OverviewProps) {
  return (
    <div className="space-y-4">
      <ServiceAccountRbacSections
        clusterId={clusterId}
        namespace={object.metadata?.namespace}
        name={object.metadata?.name ?? ""}
        onNavigate={onNavigate}
      />
      <ServiceAccountExtras object={object} />
    </div>
  );
}

function RoleOverview({ object, clusterId, onNavigate }: OverviewProps) {
  return (
    <div className="space-y-4">
      <RoleBindingsSection clusterId={clusterId} object={object} onNavigate={onNavigate} />
      <RoleRbacSections object={object} />
    </div>
  );
}

function RoleBindingOverview({ object, clusterId, onNavigate }: OverviewProps) {
  return (
    <div className="space-y-4">
      <RoleBindingRbacSections clusterId={clusterId} object={object} onNavigate={onNavigate} />
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
          <AgeProperty timestamp={object.metadata?.creationTimestamp} />
        </PropertyList>
      </DetailSection>

      <DetailSection title="Rules" icon={<Network />} count={spec.rules?.length ?? 0}>
        <div className="space-y-2">
          {(spec.rules ?? []).map((rule: any, index: number) => (
            <div key={index} className="card-inner">
              <div className="text-[calc(12px*var(--font-scale))] font-medium text-theme-text-primary">{rule.host ?? "*"}</div>
              <div className="mt-1 space-y-0.5">
                {(rule.http?.paths ?? []).map((path: any, pathIndex: number) => (
                  <div key={pathIndex} className="flex items-center gap-2 font-mono text-[calc(11px*var(--font-scale))]">
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
          <div key={index} className="flex items-center gap-2 text-[calc(12px*var(--font-scale))]">
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

/** Radar's Certificate Info for TLS Secrets: subject, issuer and expiry. */
function CertificateSection({ object }: { object: AnyObject }) {
  const crt = (object.data as Record<string, string> | undefined)?.["tls.crt"];
  if (!crt) return null;
  const info = parseCertificate(crt);
  if (!info?.notAfter) {
    return (
      <DetailSection title="Certificate" icon={<ShieldCheck />}>
        <div className="text-[calc(12px*var(--font-scale))] text-amber-600 dark:text-amber-400">
          The value in <span className="font-mono">tls.crt</span> is not a readable X.509 certificate.
        </div>
      </DetailSection>
    );
  }
  const days = daysUntil(info.notAfter) ?? 0;
  const expired = days < 0;
  const critical = !expired && days <= 7;
  const soon = !expired && !critical && days <= 30;
  return (
    <>
      {expired || critical || soon ? (
        <div
          className={cn(
            "rounded-lg border px-3 py-2 text-[calc(12px*var(--font-scale))]",
            expired || critical
              ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
              : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
          )}
        >
          <div className="font-medium">
            {expired
              ? `Certificate expired ${Math.abs(days)}d ago`
              : critical
                ? `Certificate expires in ${days}d`
                : `Certificate expires in ${days}d`}
          </div>
          <div className="mt-1 text-xs">
            {expired
              ? "Replace the certificate or check the renewal controller."
              : "Check that cert-manager or your CA is renewing this certificate."}
          </div>
        </div>
      ) : null}
      <DetailSection title="Certificate" icon={<ShieldCheck />}>
        <PropertyList>
          <Property label="Subject (CN)" value={info.subjectCn} mono />
          <Property
            label="SANs"
            value={
              info.sans?.length ? (
                <span className="flex flex-wrap gap-1">
                  {info.sans.map((san) => (
                    <span key={san} className="badge-sm status-neutral font-mono">
                      {san}
                    </span>
                  ))}
                </span>
              ) : undefined
            }
          />
          <Property label="Issuer" value={info.issuerCn} mono />
          <Property label="Key type" value={info.keyType} mono />
          <Property label="Serial" value={info.serialNumber} mono />
          <Property
            label="Not before"
            value={info.notBefore ? formatTimestamp(info.notBefore.toISOString()) : "–"}
            mono
          />
          <Property
            label="Expires"
            value={
              <span
                className={cn(
                  expired || critical
                    ? "text-red-600 dark:text-red-400"
                    : soon
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-emerald-600 dark:text-emerald-400",
                )}
              >
                {formatTimestamp(info.notAfter.toISOString())} ({days}d)
              </span>
            }
            mono
          />
        </PropertyList>
      </DetailSection>
    </>
  );
}

function DataOverview({ object, onEditData }: OverviewProps) {
  const isSecret = object.kind === "Secret";
  const data = isSecret ? (object.data ?? {}) : { ...(object.data ?? {}), ...(object.binaryData ?? {}) };
  const rawBytes = Object.values(data as Record<string, string>).reduce<number>((sum, value) => sum + String(value ?? "").length, 0);
  const size = formatBytes(isSecret ? Math.floor((rawBytes * 3) / 4) : rawBytes);
  const typeMeta = isSecret ? (
    <>
      <span className="text-theme-text-secondary">type: {String(object.type ?? "Opaque")}</span>
      <span>· keys: {Object.keys(object.data ?? {}).length}</span>
      <span>· size: {size}</span>
    </>
  ) : (
    <>
      <span className="text-theme-text-secondary">kind: ConfigMap</span>
      <span>· keys: {Object.keys(object.data ?? {}).length}</span>
      <span>· binary: {Object.keys(object.binaryData ?? {}).length}</span>
      <span>· size: {size}</span>
    </>
  );
  return (
    <div className="space-y-4">
      {isSecret ? <CertificateSection object={object} /> : null}
      {object.immutable ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[calc(12px*var(--font-scale))] text-amber-700 dark:text-amber-300">
          <div className="font-medium">Immutable {isSecret ? "Secret" : "ConfigMap"}</div>
          <div className="mt-1 text-xs">
            Kubernetes rejects changes to its keys — edit requires deleting and recreating the object.
          </div>
        </div>
      ) : null}
      <DetailSection title={isSecret ? "Secret" : "ConfigMap"} icon={<FileSliders />}>
        <PropertyList>
          {isSecret ? <Property label="Type" value={object.type} /> : null}
          <Property label="Keys" value={Object.keys(data).length} />
          <Property label="Immutable" value={object.immutable ? "Yes" : "No"} />
          <AgeProperty timestamp={object.metadata?.creationTimestamp} />
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
        <div className="mb-2 flex items-center gap-2 font-mono text-[calc(10px*var(--font-scale))] text-theme-text-tertiary">
          <span className="truncate text-theme-text-secondary">{object.metadata?.name}</span>
          <span>·</span>
          <span>{Object.keys(data).length} keys</span>
          {object.metadata?.namespace ? <span>· {object.metadata.namespace}</span> : null}
        </div>
        <KeyValueList data={data as Record<string, string>} secret={isSecret} meta={typeMeta} />
      </DetailSection>
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
          <AgeProperty timestamp={object.metadata?.creationTimestamp} />
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
            <div className="text-[calc(10px*var(--font-scale))] uppercase tracking-wide text-theme-text-tertiary">{card.label}</div>
            <div className="mt-0.5 truncate font-mono text-[calc(13px*var(--font-scale))] font-semibold text-theme-text-primary" title={card.value}>
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
          <AgeProperty timestamp={object.metadata?.creationTimestamp} />
        </PropertyList>
      </DetailSection>

      <DetailSection title="Versions" icon={<Database />} count={versions.length}>
        <div className="space-y-1.5">
          {versions.map((version) => (
            <div key={version.name} className="rounded-md border border-theme-border-subtle bg-theme-base p-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[calc(12px*var(--font-scale))] font-medium text-theme-text-primary">{version.name}</span>
                {version.storage ? <span className="badge-sm status-neutral">storage</span> : null}
                {version.served ? (
                  <span className="badge-sm status-healthy">served</span>
                ) : (
                  <span className="badge-sm status-unknown">not served</span>
                )}
                <span className="ml-auto text-[calc(10px*var(--font-scale))] text-theme-text-tertiary">
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
                <div className="mb-1 font-mono text-[calc(10px*var(--font-scale))] text-theme-text-tertiary">{version.name}</div>
                <div className="overflow-hidden rounded-md border border-theme-border">
                  <div className="grid grid-cols-[1.2fr_0.7fr_1.8fr_60px] border-b border-theme-border bg-theme-base px-2 py-1 text-[calc(9px*var(--font-scale))] uppercase tracking-wide text-theme-text-tertiary">
                    <span>Name</span>
                    <span>Type</span>
                    <span>JSON path</span>
                    <span className="text-right">Priority</span>
                  </div>
                  {version.additionalPrinterColumns.map((column: any) => (
                    <div
                      key={column.name}
                      className="grid grid-cols-[1.2fr_0.7fr_1.8fr_60px] items-center border-b-subtle px-2 py-1 text-[calc(10px*var(--font-scale))] last:border-0"
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
            <div key={index} className="flex items-center gap-2 text-[calc(12px*var(--font-scale))]">
              <span className="badge-sm status-unknown">{metric.type}</span>
              <span className="text-theme-text-secondary">
                {metric.resource?.name ?? metric.pods?.metric?.name ?? metric.object?.metric?.name ?? "–"}
              </span>
              <span className="ml-auto font-mono text-[calc(11px*var(--font-scale))] text-theme-text-tertiary">
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
    return <span className="text-[calc(11px*var(--font-scale))] text-theme-text-tertiary">any</span>;
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
        <div className="mb-1 text-[calc(10px*var(--font-scale))] font-semibold uppercase tracking-wider text-theme-text-tertiary">{label}</div>
        <div className="space-y-1">
          {terms.map((term, index) => {
            const affinityTerm = term.podAffinityTerm ?? term;
            return (
              <div key={index} className="rounded-md border border-theme-border-subtle bg-theme-base p-2 text-[calc(11px*var(--font-scale))]">
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
    <div className="space-y-3 text-[calc(11px*var(--font-scale))]">
      {requiredTerms.length > 0 ? (
        <div>
          <div className="mb-1 text-[calc(10px*var(--font-scale))] font-semibold uppercase tracking-wider text-theme-text-tertiary">
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
          <div className="mb-1 text-[calc(10px*var(--font-scale))] font-semibold uppercase tracking-wider text-theme-text-tertiary">
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

/** "observedGeneration" → "Observed Generation" for the flat status rows. */
function statusFieldLabel(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function GenericOverview({ object, resource, onNavigate }: OverviewProps) {
  const status = (object.status ?? {}) as Record<string, unknown>;
  const metadata = object.metadata ?? {};
  const printerColumns = (resource.printerColumns ?? []) as Array<{
    name: string;
    jsonPath?: string;
    type?: string;
  }>;
  const statusBadge = resourceStatus(object, resource.kind);
  // Radar reads a status in a fixed order so the answer lands in the same
  // place on every custom resource; everything else follows alphabetically.
  const priority = [
    "phase",
    "state",
    "ready",
    "available",
    "replicas",
    "currentReplicas",
    "readyReplicas",
    "availableReplicas",
    "updatedReplicas",
    "observedGeneration",
    "message",
    "reason",
  ];
  const flatStatus = Object.entries(status)
    .filter(([, value]) => value === null || typeof value !== "object")
    .sort(([left], [right]) => {
      const leftIndex = priority.indexOf(left);
      const rightIndex = priority.indexOf(right);
      if (leftIndex >= 0 || rightIndex >= 0) {
        return (leftIndex >= 0 ? leftIndex : priority.length) - (rightIndex >= 0 ? rightIndex : priority.length);
      }
      return left.localeCompare(right);
    });
  const nestedStatus = Object.fromEntries(
    Object.entries(status).filter(([, value]) => value !== null && typeof value === "object"),
  );
  const spec = (object.spec ?? {}) as Record<string, unknown>;
  const specPriority = [
    "replicas",
    "selector",
    "schedule",
    "suspend",
    "concurrencyPolicy",
    "parallelism",
    "completions",
    "backoffLimit",
    "image",
    "command",
    "args",
    "ports",
    "resources",
  ];
  const flatSpec = Object.entries(spec)
    .filter(([, value]) => value === null || typeof value !== "object")
    .sort(([left], [right]) => {
      const leftIndex = specPriority.indexOf(left);
      const rightIndex = specPriority.indexOf(right);
      if (leftIndex >= 0 || rightIndex >= 0) {
        return (leftIndex >= 0 ? leftIndex : specPriority.length) - (rightIndex >= 0 ? rightIndex : specPriority.length);
      }
      return left.localeCompare(right);
    });
  const nestedSpec = Object.fromEntries(
    Object.entries(spec).filter(([, value]) => value !== null && typeof value === "object"),
  );

  return (
    <div className="space-y-4">
      {statusBadge.text && statusBadge.text !== "—" ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("badge", toneClass(statusBadge.tone))} title={statusBadge.detail}>
            {statusBadge.text}
          </span>
          <span className="font-mono text-[calc(11px*var(--font-scale))] text-theme-text-tertiary">
            {resource.apiVersion} · {resource.kind}
          </span>
        </div>
      ) : (
        <div className="font-mono text-[calc(11px*var(--font-scale))] text-theme-text-tertiary">
          {resource.apiVersion} · {resource.kind}
        </div>
      )}

      {Object.keys(status).length === 0 && Object.keys(spec).length === 0 ? (
        <div className="rounded-lg border border-slate-500/20 bg-slate-500/10 p-4">
          <div className="flex items-start gap-3">
            <FileSliders className="mt-0.5 h-5 w-5 shrink-0 text-theme-text-tertiary" />
            <div>
              <div className="text-[calc(13px*var(--font-scale))] font-medium text-theme-text-secondary">Custom Resource</div>
              <div className="mt-1 text-xs text-theme-text-tertiary">
                This resource type doesn&apos;t have a dedicated view and reports no spec or status fields. Use the YAML tab
                for the full definition.
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Kind", value: resource.kind },
          { label: "API version", value: resource.apiVersion },
          { label: "Namespace", value: metadata.namespace ?? "cluster-scoped" },
          { label: "Age", value: formatAge(metadata.creationTimestamp) },
        ].map((card) => (
          <div key={card.label} className="card-inner">
            <div className="text-[calc(10px*var(--font-scale))] uppercase tracking-wide text-theme-text-tertiary">{card.label}</div>
            {card.label === "Age" ? (
              <Tooltip
                side="top"
                content={
                  <div className="space-y-0.5">
                    <div className="text-[calc(10px*var(--font-scale))] uppercase tracking-wide text-theme-text-disabled">Created</div>
                    <div className="font-mono text-[calc(11px*var(--font-scale))] text-theme-text-primary">
                      {formatTimestamp(metadata.creationTimestamp)}
                    </div>
                  </div>
                }
              >
                <div className="mt-0.5 truncate font-mono text-[calc(12px*var(--font-scale))] font-semibold text-theme-text-primary">
                  {card.value}
                </div>
              </Tooltip>
            ) : (
              <div className="mt-0.5 truncate font-mono text-[calc(12px*var(--font-scale))] font-semibold text-theme-text-primary" title={card.value}>
                {card.value}
              </div>
            )}
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
                  className="grid grid-cols-[140px_1fr] items-center border-b-subtle px-2 py-1 text-[calc(11px*var(--font-scale))] last:border-0"
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

      {Object.keys(nestedStatus).length ? (
        <DetailSection title="Status details" icon={<Layers />} defaultOpen={false}>
          <NestedObject value={nestedStatus} />
        </DetailSection>
      ) : null}

      <DetailSection
        title="Specification"
        icon={<Settings2 />}
        count={Object.keys(spec).length}
        defaultOpen={flatSpec.length <= 8}
      >
        {Object.keys(spec).length === 0 ? (
          <div className="text-xs text-theme-text-tertiary">This resource has no spec.</div>
        ) : flatSpec.length === 0 ? (
          <NestedObject value={spec} />
        ) : (
          <PropertyList>
            {flatSpec.map(([key, value]) => (
              <Property
                key={key}
                label={statusFieldLabel(key)}
                value={
                  typeof value === "boolean"
                    ? value
                      ? "Yes"
                      : "No"
                    : Array.isArray(value)
                      ? value.map((entry) => (typeof entry === "object" ? JSON.stringify(entry) : String(entry))).join(", ")
                      : String(value)
                }
                mono
              />
            ))}
          </PropertyList>
        )}
      </DetailSection>
      <DetailSection title="Status" icon={<Info />} count={flatStatus.length}>
        {Object.keys(status).length === 0 ? (
          <div className="text-xs text-theme-text-tertiary">This resource has no status fields.</div>
        ) : flatStatus.length === 0 ? (
          <NestedObject value={status} />
        ) : (
          <PropertyList>
            {flatStatus.map(([key, value]) => (
              <Property
                key={key}
                label={statusFieldLabel(key)}
                value={
                  typeof value === "boolean"
                    ? value
                      ? "Yes"
                      : "No"
                    : Array.isArray(value)
                      ? value.map((entry) => (typeof entry === "object" ? JSON.stringify(entry) : String(entry))).join(", ")
                      : String(value)
                }
                mono
              />
            ))}
          </PropertyList>
        )}
      </DetailSection>

      {Object.keys(nestedSpec).length ? (
        <DetailSection title="Specification details" icon={<Layers />} defaultOpen={false}>
          <NestedObject value={nestedSpec} />
        </DetailSection>
      ) : null}
    </div>
  );
}