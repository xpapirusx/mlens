import type { KubeObject } from "@shared/types";
import { Database, FileSliders, Tags } from "lucide-react";
import { formatAge, formatTimestamp } from "../../lib/format";
import { NestedObject, DetailSection, Property, PropertyList } from "./DetailSections";

export function DetailsTab({ object }: { object: KubeObject }) {
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
                <span className="truncate font-mono text-theme-text-primary">{owner.name}</span>
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

      <DetailSection title="Specification" icon={<Database />} defaultOpen={false}>
        {object.spec ? <NestedObject value={object.spec} /> : <div className="text-xs text-theme-text-tertiary">This resource has no spec.</div>}
      </DetailSection>

      <DetailSection title="Status" icon={<Database />} defaultOpen={false}>
        {object.status ? <NestedObject value={object.status} /> : <div className="text-xs text-theme-text-tertiary">This resource has no status.</div>}
      </DetailSection>
    </div>
  );
}
