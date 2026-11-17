import type { KubeObject } from "@shared/types";
import { ChevronRight, Database, ExternalLink, FileSliders, Tags } from "lucide-react";
import { useState } from "react";
import { formatAge, formatTimestamp } from "../../lib/format";
import { DetailSection, Property, PropertyList } from "./DetailSections";
import { cn } from "../../lib/cn";

type Navigate = (kind: string, name: string, namespace?: string, apiVersion?: string) => void;

/** Cluster-scoped built-ins: never open them under a namespace. */
const CLUSTER_SCOPED = new Set([
  "Node",
  "PersistentVolume",
  "StorageClass",
  "ClusterRole",
  "ClusterRoleBinding",
  "Namespace",
  "CustomResourceDefinition",
  "APIService",
  "PriorityClass",
  "CSIDriver",
  "CSINode",
  "VolumeAttachment",
  "RuntimeClass",
]);

/** Field name → the kind its string/object value points at. */
const REF_KINDS: Record<string, string> = {
  volumeName: "PersistentVolume",
  claimName: "PersistentVolumeClaim",
  storageClassName: "StorageClass",
  serviceAccountName: "ServiceAccount",
  serviceAccount: "ServiceAccount",
  serviceName: "Service",
  nodeName: "Node",
  secretName: "Secret",
  configMapName: "ConfigMap",
  secret: "Secret",
  configMap: "ConfigMap",
  imagePullSecrets: "Secret",
  targetKind: "",
};

interface RefTarget {
  kind: string;
  name: string;
  namespace?: string;
  apiVersion?: string;
}

/**
 * Recognises the reference shapes Kubernetes uses: `{kind,name,namespace}`,
 * `{name}` under a known field, and plain strings like `volumeName: my-pv`.
 */
function refTarget(key: string, value: unknown, parentNamespace?: string): RefTarget | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const name =
      typeof record.name === "string"
        ? record.name
        : typeof record.secretName === "string"
          ? record.secretName
          : typeof record.configMapName === "string"
            ? record.configMapName
            : undefined;
    if (typeof record.kind === "string" && name) {
      return {
        kind: record.kind,
        name,
        namespace: typeof record.namespace === "string" ? record.namespace : parentNamespace,
        apiVersion: typeof record.apiVersion === "string" ? record.apiVersion : undefined,
      };
    }
    const kind = REF_KINDS[key];
    if (kind && name) {
      return { kind, name, namespace: CLUSTER_SCOPED.has(kind) ? undefined : parentNamespace };
    }
    return null;
  }
  if (typeof value === "string") {
    const kind = REF_KINDS[key];
    if (kind && value && value !== "null" && !value.startsWith("<")) {
      return { kind, name: value, namespace: CLUSTER_SCOPED.has(kind) ? undefined : parentNamespace };
    }
  }
  return null;
}

function RefLink({ target, onNavigate, children }: { target: RefTarget; onNavigate?: Navigate; children: React.ReactNode }) {
  if (!onNavigate) return <>{children}</>;
  return (
    <button
      type="button"
      className="inline-flex max-w-full items-center gap-1 truncate text-accent-text hover:underline"
      title={`Open ${target.kind}/${target.name}`}
      onClick={() => onNavigate(target.kind, target.name, target.namespace, target.apiVersion)}
    >
      <span className="truncate">{children}</span>
      <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
    </button>
  );
}

export function DetailsTab({ object, onNavigate }: { object: KubeObject; onNavigate?: Navigate }) {
  const metadata = object.metadata ?? {};
  const labels = metadata.labels ?? {};
  const annotations = metadata.annotations ?? {};

  return (
    <div className="space-y-4 p-3">
      <DetailSection title="Metadata" icon={<FileSliders />}>
        <PropertyList>
          <Property label="Name" value={metadata.name} copyable mono />
          <Property label="Namespace" value={metadata.namespace ?? "cluster-scoped"} copyable />
          <Property label="Kind" value={object.kind} />
          <Property label="API version" value={object.apiVersion} mono />
          <Property label="UID" value={metadata.uid} copyable mono />
          <Property label="Created" value={formatTimestamp(metadata.creationTimestamp)} />
          <Property label="Age" value={formatAge(metadata.creationTimestamp)} />
          <Property label="Resource version" value={metadata.resourceVersion} mono copyable />
          <Property label="Generation" value={metadata.generation ?? "–"} />
          {metadata.deletionTimestamp ? (
            <Property
              label="Deleting since"
              value={formatTimestamp(metadata.deletionTimestamp)}
              className="[&>span:last-child]:text-red-500"
            />
          ) : null}
          {metadata.finalizers?.length ? (
            <Property label="Finalizers" value={metadata.finalizers.join(", ")} mono />
          ) : null}
        </PropertyList>
      </DetailSection>

      <DetailSection title="Owner references" icon={<Database />} defaultOpen={Boolean(metadata.ownerReferences?.length)}>
        {metadata.ownerReferences?.length ? (
          <div className="space-y-1.5">
            {metadata.ownerReferences.map((owner) => (
              <div key={owner.uid} className="card-inner flex items-center gap-2 text-[12px]">
                <span className="badge-sm status-unknown">{owner.kind}</span>
                <RefLink
                  target={{
                    kind: owner.kind,
                    name: owner.name,
                    namespace: CLUSTER_SCOPED.has(owner.kind) ? undefined : metadata.namespace,
                    apiVersion: owner.apiVersion,
                  }}
                  onNavigate={onNavigate}
                >
                  <span className="truncate font-mono text-theme-text-primary">{owner.name}</span>
                </RefLink>
                {owner.controller ? <span className="badge-sm status-neutral">controller</span> : null}
                <span className="ml-auto truncate font-mono text-[10px] text-theme-text-disabled">{owner.uid}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-theme-text-tertiary">No owner references.</div>
        )}
      </DetailSection>

      <DetailSection title="Labels" icon={<Tags />} count={Object.keys(labels).length} defaultOpen={false}>
        <div className="flex flex-wrap gap-1">
          {Object.entries(labels).map(([key, value]) => (
            <span key={key} className="badge-sm status-unknown font-mono">
              {key}={value}
            </span>
          ))}
          {Object.keys(labels).length === 0 ? <span className="text-xs text-theme-text-tertiary">No labels.</span> : null}
        </div>
      </DetailSection>

      <DetailSection
        title="Annotations"
        icon={<FileSliders />}
        count={Object.keys(annotations).length}
        defaultOpen={false}
      >
        <div className="space-y-1">
          {Object.entries(annotations).map(([key, value]) => (
            <div key={key} className="rounded border border-theme-border-subtle px-2 py-1">
              <div className="break-all font-mono text-[10px] text-theme-text-tertiary">{key}</div>
              <div className="mt-0.5 whitespace-pre-wrap break-all font-mono text-[11px] text-theme-text-primary">
                {value}
              </div>
            </div>
          ))}
          {Object.keys(annotations).length === 0 ? (
            <span className="text-xs text-theme-text-tertiary">No annotations.</span>
          ) : null}
        </div>
      </DetailSection>

      <DetailSection title="Specification" icon={<Database />} defaultOpen>
        {object.spec ? (
          <StructuredFields value={object.spec as Record<string, unknown>} namespace={metadata.namespace} onNavigate={onNavigate} />
        ) : (
          <div className="text-xs text-theme-text-tertiary">This resource has no spec.</div>
        )}
      </DetailSection>

      <DetailSection title="Status" icon={<Database />} defaultOpen>
        {object.status ? (
          <StructuredFields value={object.status as Record<string, unknown>} namespace={metadata.namespace} onNavigate={onNavigate} />
        ) : (
          <div className="text-xs text-theme-text-tertiary">This resource has no status.</div>
        )}
      </DetailSection>
    </div>
  );
}

function StructuredFields({
  value,
  namespace,
  onNavigate,
  depth = 0,
}: {
  value: Record<string, unknown>;
  namespace?: string;
  onNavigate?: Navigate;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const entries = Object.entries(value ?? {}).sort(([left], [right]) =>
    left.localeCompare(right, undefined, { numeric: true }),
  );
  if (entries.length === 0) {
    return <div className="text-xs text-theme-text-tertiary">No fields.</div>;
  }

  const flat = entries.filter(([, entry]) => entry === null || typeof entry !== "object");
  const nested = entries.filter(([, entry]) => entry !== null && typeof entry === "object");

  const display = (key: string, entry: unknown) => {
    const target = refTarget(key, entry, namespace);
    if (target && typeof entry === "string") {
      return (
        <RefLink target={target} onNavigate={onNavigate}>
          <span className="font-mono">{entry}</span>
        </RefLink>
      );
    }
    if (entry === null || entry === undefined) return "null";
    if (typeof entry === "boolean") {
      return <span className={entry ? "badge-sm status-healthy" : "badge-sm status-unknown"}>{String(entry)}</span>;
    }
    return String(entry);
  };

  const toggle = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="space-y-3">
      {flat.length > 0 ? (
        <PropertyList>
          {flat.map(([key, entry]) => (
            <Property
              key={key}
              label={key}
              value={display(key, entry)}
              mono={typeof entry === "string" && /^[a-z0-9./:_-]+$/i.test(entry) && entry.length < 80}
            />
          ))}
        </PropertyList>
      ) : null}
      {nested.map(([key, entry]) => {
        const isArray = Array.isArray(entry);
        // Arrays of pure references (imagePullSecrets, secrets, …) become links.
        const refItems =
          isArray && entry.length > 0 && (entry as unknown[]).every((item) => refTarget(key, item, namespace))
            ? (entry as unknown[])
            : null;
        const singleRef = !isArray ? refTarget(key, entry, namespace) : null;
        const open = expanded.has(key);
        const count = isArray ? entry.length : Object.keys(entry as object).length;

        if (singleRef) {
          return (
            <Property
              key={key}
              label={key}
              value={
                <RefLink target={singleRef} onNavigate={onNavigate}>
                  <span className="font-mono">
                    {singleRef.kind}/{singleRef.name}
                    {singleRef.namespace ? ` · ${singleRef.namespace}` : ""}
                  </span>
                </RefLink>
              }
            />
          );
        }

        if (refItems) {
          return (
            <div key={key} className="min-w-0 overflow-hidden rounded-md border border-theme-border-subtle bg-theme-base">
              <div className="flex h-7 items-center gap-1.5 px-2">
                <span className="font-mono text-[11px] text-theme-text-primary">{key}</span>
                <span className="ml-auto text-[10px] text-theme-text-disabled">{refItems.length} items</span>
              </div>
              <div className="border-t border-theme-border-subtle">
                {refItems.map((item, index) => {
                  const target = refTarget(key, item, namespace)!;
                  return (
                    <div key={`${key}-${index}`} className="flex items-center gap-2 px-2 py-1 text-[11px]">
                      <RefLink target={target} onNavigate={onNavigate}>
                        <span className="font-mono">{target.name}</span>
                      </RefLink>
                      <span className="ml-auto text-[10px] text-theme-text-disabled">{target.kind}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }

        return (
          <div key={key} className="min-w-0 overflow-hidden rounded-md border border-theme-border-subtle bg-theme-base">
            <button
              type="button"
              className="flex h-7 w-full items-center gap-1.5 px-2 text-left hover:bg-theme-hover/50"
              onClick={() => toggle(key)}
              aria-expanded={open}
            >
              <ChevronRight className={cn("h-3 w-3 shrink-0 text-theme-text-tertiary transition-transform", open && "rotate-90")} />
              <span className="font-mono text-[11px] text-theme-text-primary">{key}</span>
              <span className="ml-auto text-[10px] text-theme-text-disabled">
                {isArray ? `${count} item${count === 1 ? "" : "s"}` : `${count} field${count === 1 ? "" : "s"}`}
              </span>
            </button>
            {open ? (
              depth < 3 && !isArray ? (
                <div className="border-t border-theme-border-subtle p-2">
                  <StructuredFields
                    value={entry as Record<string, unknown>}
                    namespace={namespace}
                    onNavigate={onNavigate}
                    depth={depth + 1}
                  />
                </div>
              ) : (
                <pre className="max-h-72 overflow-auto border-t border-theme-border-subtle p-2 font-mono text-[10px] leading-relaxed text-theme-text-secondary">
                  {JSON.stringify(entry, null, 2)}
                </pre>
              )
            ) : null}
          </div>
        );
      })}
    </div>
  );
}