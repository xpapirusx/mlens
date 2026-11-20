import { Box, Database, HardDrive, Link as LinkIcon, Server, Settings2 } from "lucide-react";
import { AgeProperty, ConditionsList, DetailSection, NestedObject, Property, PropertyList } from "./DetailSections";
import { cn } from "../../lib/cn";
import { resourceStatus, toneClass } from "../../lib/status";
import { useClaimPods } from "./useDetailsData";

const ACCESS_MODE: Record<string, string> = {
  ReadWriteOnce: "RWO",
  ReadOnlyMany: "ROX",
  ReadWriteMany: "RWX",
  ReadWriteOncePod: "RWOP",
};

function formatAccessModes(modes: string[] | undefined): string | undefined {
  if (!modes || modes.length === 0) return undefined;
  return modes.map((mode) => ACCESS_MODE[mode] ?? mode).join(", ");
}

function phaseTone(phase: string | undefined): string {
  if (phase === "Bound" || phase === "Available") return "text-emerald-600 dark:text-emerald-400";
  if (phase === "Pending" || phase === "Released") return "text-amber-600 dark:text-amber-400";
  if (phase === "Lost" || phase === "Failed") return "text-red-600 dark:text-red-400";
  return "";
}

/**
 * Storage views for PVC, PV and StorageClass: the claim → volume → CSI chain,
 * the provisioner annotations that explain a Pending claim, and the class
 * parameters that decide how a volume is created.
 */
export function StorageOverview({
  object,
  onNavigate,
  clusterId,
}: {
  object: any;
  onNavigate: (kind: string, name: string, namespace?: string, apiVersion?: string) => void;
  clusterId: string;
}) {
  const kind: string = object.kind ?? "";
  if (kind === "StorageClass") return <StorageClassView object={object} />;
  if (kind === "PersistentVolume") return <PersistentVolumeView object={object} onNavigate={onNavigate} />;
  return <PersistentVolumeClaimView object={object} onNavigate={onNavigate} clusterId={clusterId} />;
}

function StorageClassView({ object }: { object: any }) {
  const parameters = (object.parameters ?? {}) as Record<string, unknown>;
  const mountOptions = (object.mountOptions ?? []) as string[];
  const allowedTopologies = (object.allowedTopologies ?? []) as Array<Record<string, any>>;
  return (
    <div className="space-y-4">
      <DetailSection title="Configuration" icon={<Database />}>
        <PropertyList>
          <Property label="Provisioner" value={object.provisioner} mono copyable />
          <Property
            label="Reclaim policy"
            value={
              object.reclaimPolicy ? (
                <span className={object.reclaimPolicy === "Delete" ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}>
                  {object.reclaimPolicy}
                </span>
              ) : undefined
            }
          />
          <Property
            label="Volume binding"
            value={
              object.volumeBindingMode
                ? `${object.volumeBindingMode}${object.volumeBindingMode === "WaitForFirstConsumer" ? " — waits for a scheduled Pod" : ""}`
                : undefined
            }
          />
          <Property
            label="Volume expansion"
            value={object.allowVolumeExpansion === true ? "Allowed" : object.allowVolumeExpansion === false ? "Not allowed" : undefined}
          />
          <AgeProperty timestamp={object.metadata?.creationTimestamp} />
        </PropertyList>
      </DetailSection>

      <DetailSection title="Parameters" icon={<Settings2 />} count={Object.keys(parameters).length} defaultOpen={Object.keys(parameters).length <= 10}>
        {Object.keys(parameters).length === 0 ? (
          <div className="text-xs text-theme-text-tertiary">This class has no parameters.</div>
        ) : (
          <PropertyList>
            {Object.entries(parameters).map(([key, value]) => (
              <Property key={key} label={key} value={formatScalar(value)} mono />
            ))}
          </PropertyList>
        )}
      </DetailSection>

      {mountOptions.length > 0 ? (
        <DetailSection title="Mount options" icon={<HardDrive />} count={mountOptions.length}>
          <div className="flex flex-wrap gap-1">
            {mountOptions.map((option) => (
              <span key={option} className="badge-sm status-neutral font-mono">
                {option}
              </span>
            ))}
          </div>
        </DetailSection>
      ) : null}

      {allowedTopologies.length > 0 ? (
        <DetailSection title="Allowed topologies" icon={<Server />} count={allowedTopologies.length} defaultOpen={false}>
          <div className="space-y-2">
            {allowedTopologies.map((topology, index) => (
              <div key={index} className="card-inner">
                <NestedObject value={topology} />
              </div>
            ))}
          </div>
        </DetailSection>
      ) : null}

      {object.metadata?.labels || object.metadata?.annotations ? (
        <DetailSection title="Labels & annotations" defaultOpen={false}>
          <PropertyList>
            {Object.entries(object.metadata?.labels ?? {}).map(([key, value]) => (
              <Property key={`label-${key}`} label={key} value={String(value)} mono />
            ))}
            {Object.entries(object.metadata?.annotations ?? {}).map(([key, value]) => (
              <Property key={`annotation-${key}`} label={key} value={String(value)} mono />
            ))}
          </PropertyList>
        </DetailSection>
      ) : null}
    </div>
  );
}

function PersistentVolumeClaimView({ object, onNavigate, clusterId }: StorageOverviewProps & { clusterId: string }) {
  const spec = object.spec ?? {};
  const status = object.status ?? {};
  const namespace = object.metadata?.namespace as string | undefined;
  const annotations = object.metadata?.annotations ?? {};
  const phase = status.phase as string | undefined;
  const claimPods = useClaimPods(clusterId, namespace, object.metadata?.name);
  const provisioner =
    annotations["volume.kubernetes.io/storage-provisioner"] ?? annotations["volume.beta.kubernetes.io/storage-provisioner"];
  const selectedNode = annotations["volume.kubernetes.io/selected-node"];
  const bindCompleted = annotations["pv.kubernetes.io/bind-completed"];
  const unused = Array.isArray(status.conditions)
    ? status.conditions.find((condition: any) => condition?.type === "Unused" && condition.status === "True")
    : undefined;

  return (
    <div className="space-y-4">
      {phase === "Lost" ? (
        <Notice tone="error" title="Claim lost its bound volume">
          The PersistentVolume this claim was bound to is no longer available.
        </Notice>
      ) : null}
      {phase === "Pending" ? (
        <Notice tone="info" title="Pending — not yet bound">
          The volume is still being provisioned, or a <span className="font-mono">WaitForFirstConsumer</span> class waits for a
          Pod that mounts it. Check the StorageClass and its provisioner.
        </Notice>
      ) : null}
      {unused ? (
        <Notice tone="info" title="Claim is not used">
          No non-terminal Pod currently references this claim. Check the retention policy before deleting it.
        </Notice>
      ) : null}

      <DetailSection title="Status" icon={<HardDrive />}>
        <PropertyList>
          <Property label="Phase" value={<span className={phaseTone(phase)}>{phase ?? "–"}</span>} />
          <Property label="Capacity" value={status.capacity?.storage} mono />
          <Property label="Requested" value={spec.resources?.requests?.storage} mono />
          <Property label="Access modes" value={formatAccessModes(spec.accessModes)} />
          <Property label="Volume mode" value={spec.volumeMode ?? "Filesystem"} />
          <Property
            label="Storage class"
            value={
              spec.storageClassName ? (
                <ResourceButton
                  kind="StorageClass"
                  name={spec.storageClassName}
                  onNavigate={onNavigate}
                />
              ) : (
                "–"
              )
            }
          />
          <Property
            label="Volume"
            value={
              spec.volumeName ? (
                <ResourceButton kind="PersistentVolume" name={spec.volumeName} onNavigate={onNavigate} />
              ) : (
                "not bound yet"
              )
            }
            copyable={Boolean(spec.volumeName)}
          />
          <AgeProperty timestamp={object.metadata?.creationTimestamp} />
        </PropertyList>
      </DetailSection>

      <DetailSection
        title="Used by Pods"
        icon={<Box />}
        count={claimPods.pods.length}
        defaultOpen={claimPods.pods.length > 0}
      >
        {claimPods.loading && claimPods.pods.length === 0 ? (
          <div className="text-xs text-theme-text-tertiary">Looking for Pods that mount this claim…</div>
        ) : claimPods.error ? (
          <div className="text-xs text-theme-text-tertiary">Pod inventory unavailable: {claimPods.error}</div>
        ) : claimPods.pods.length === 0 ? (
          <div className="text-xs text-theme-text-tertiary">No Pods currently mount this claim.</div>
        ) : (
          <div className="space-y-1">
            {[...claimPods.pods]
              .sort((left, right) => String(left.metadata?.name).localeCompare(String(right.metadata?.name)))
              .map((pod) => {
                const podNamespace = pod.metadata?.namespace ?? namespace;
                const podName = pod.metadata?.name ?? "";
                const podStatus = resourceStatus(pod, "Pod");
                return (
                  <div
                    key={pod.metadata?.uid ?? `${podNamespace}/${podName}`}
                    className="flex items-center justify-between gap-2 rounded-md border border-theme-border-subtle bg-theme-base px-2 py-1.5"
                  >
                    <button
                      type="button"
                      onClick={() => onNavigate("Pod", podName, podNamespace)}
                      className="min-w-0 truncate text-left font-mono text-[calc(11px*var(--font-scale))] text-accent-text hover:underline"
                      title={`Open Pod ${podNamespace}/${podName}`}
                    >
                      {podName}
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                      {pod.spec?.nodeName ? (
                        <span className="hidden truncate text-[calc(10px*var(--font-scale))] text-theme-text-tertiary sm:inline">
                          {String(pod.spec.nodeName)}
                        </span>
                      ) : null}
                      <span className={cn("badge-sm", toneClass(podStatus.tone))} title={podStatus.detail}>
                        {podStatus.text}
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </DetailSection>

      {provisioner || selectedNode || bindCompleted ? (
        <DetailSection title="Provisioner" icon={<Settings2 />}>
          <PropertyList>
            <Property label="Provisioner" value={provisioner} mono copyable />
            <Property label="Selected node" value={selectedNode} mono />
            <Property label="Bind completed" value={bindCompleted ? "Yes" : bindCompleted === "false" ? "No" : undefined} />
          </PropertyList>
        </DetailSection>
      ) : null}

      {Array.isArray(status.conditions) && status.conditions.length > 0 ? (
        <DetailSection title="Conditions" icon={<HardDrive />} count={status.conditions.length} defaultOpen={false}>
          <ConditionsList conditions={status.conditions} />
        </DetailSection>
      ) : null}
    </div>
  );
}

function PersistentVolumeView({ object, onNavigate }: StorageOverviewProps) {
  const spec = object.spec ?? {};
  const status = object.status ?? {};
  const phase = status.phase as string | undefined;
  const claimRef = spec.claimRef;
  const csi = spec.csi;
  const nodeTerms = spec.nodeAffinity?.required?.nodeSelectorTerms as any[] | undefined;

  return (
    <div className="space-y-4">
      {phase === "Failed" ? (
        <Notice tone="error" title="Volume failed">
          The PersistentVolume is in the Failed phase.
        </Notice>
      ) : null}
      {phase === "Released" ? (
        <Notice tone="warning" title="Released — not yet reclaimed">
          The claim was deleted; the volume is waiting for its reclaim policy to run.
        </Notice>
      ) : null}

      <DetailSection title="Status" icon={<HardDrive />}>
        <PropertyList>
          <Property label="Phase" value={<span className={phaseTone(phase)}>{phase ?? "–"}</span>} />
          <Property label="Capacity" value={spec.capacity?.storage} mono />
          <Property label="Access modes" value={formatAccessModes(spec.accessModes)} />
          <Property label="Volume mode" value={spec.volumeMode ?? "Filesystem"} />
          <Property
            label="Reclaim policy"
            value={
              spec.persistentVolumeReclaimPolicy ? (
                <span
                  className={
                    spec.persistentVolumeReclaimPolicy === "Delete"
                      ? "text-red-600 dark:text-red-400"
                      : "text-emerald-600 dark:text-emerald-400"
                  }
                >
                  {spec.persistentVolumeReclaimPolicy}
                </span>
              ) : undefined
            }
          />
          <Property
            label="Storage class"
            value={
              spec.storageClassName ? (
                <ResourceButton kind="StorageClass" name={spec.storageClassName} onNavigate={onNavigate} />
              ) : (
                "–"
              )
            }
          />
          <AgeProperty timestamp={object.metadata?.creationTimestamp} />
        </PropertyList>
      </DetailSection>

      {claimRef ? (
        <DetailSection title="Claim" icon={<LinkIcon />}>
          <PropertyList>
            <Property label="Namespace" value={claimRef.namespace} mono />
            <Property
              label="Name"
              value={
                claimRef.name ? (
                  <ResourceButton
                    kind="PersistentVolumeClaim"
                    name={claimRef.name}
                    namespace={claimRef.namespace}
                    onNavigate={onNavigate}
                  />
                ) : undefined
              }
            />
            <Property label="UID" value={claimRef.uid} mono />
          </PropertyList>
        </DetailSection>
      ) : null}

      {csi ? (
        <DetailSection title="CSI" icon={<Database />}>
          <PropertyList>
            <Property label="Driver" value={csi.driver} mono copyable />
            <Property label="Volume handle" value={csi.volumeHandle} mono copyable />
            <Property label="FS type" value={csi.fsType} mono />
            {Object.entries(csi.volumeAttributes ?? {}).map(([key, value]) => (
              <Property key={key} label={key} value={formatScalar(value)} mono />
            ))}
          </PropertyList>
        </DetailSection>
      ) : null}

      {nodeTerms && nodeTerms.length > 0 ? (
        <DetailSection title="Node affinity" icon={<Server />} defaultOpen={false}>
          <div className="space-y-2">
            {nodeTerms.map((term, termIndex) => (
              <div key={termIndex} className="flex flex-wrap gap-1">
                {(term.matchExpressions ?? []).map((expression: any, index: number) => (
                  <span key={index} className="badge-sm status-neutral font-mono">
                    {expression.key} {expression.operator}
                    {expression.values?.length ? ` (${expression.values.join(",")})` : ""}
                  </span>
                ))}
                {(term.matchFields ?? []).map((field: any, index: number) => (
                  <span key={`field-${index}`} className="badge-sm status-neutral font-mono">
                    {field.key} {field.operator}
                    {field.values?.length ? ` (${field.values.join(",")})` : ""}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </DetailSection>
      ) : null}

      {Array.isArray(status.conditions) && status.conditions.length > 0 ? (
        <DetailSection title="Conditions" icon={<HardDrive />} count={status.conditions.length} defaultOpen={false}>
          <ConditionsList conditions={status.conditions} />
        </DetailSection>
      ) : null}
    </div>
  );
}

interface StorageOverviewProps {
  object: any;
  onNavigate: (kind: string, name: string, namespace?: string, apiVersion?: string) => void;
}

function ResourceButton({
  kind,
  name,
  namespace,
  onNavigate,
}: {
  kind: string;
  name?: string;
  namespace?: string;
  onNavigate: StorageOverviewProps["onNavigate"];
}) {
  if (!name) return <span>–</span>;
  return (
    <button
      type="button"
      onClick={() => onNavigate(kind, name, namespace)}
      className="font-mono text-accent-text hover:underline"
      title={`Open ${kind} ${namespace ? `${namespace}/` : ""}${name}`}
    >
      {name}
    </button>
  );
}

function Notice({ tone, title, children }: { tone: "info" | "warning" | "error"; title: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2 text-[calc(12px*var(--font-scale))]",
        tone === "error"
          ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
          : tone === "warning"
            ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
            : "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
      )}
    >
      <div className="font-medium">{title}</div>
      <div className="mt-1 text-xs">{children}</div>
    </div>
  );
}

function formatScalar(value: unknown): string {
  if (value === null || value === undefined) return "–";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
