import type { KubeObject } from "@shared/types";
import { ChevronRight, Database, FileSliders, Tags } from "lucide-react";
import { useState } from "react";
import { formatAge, formatTimestamp } from "../../lib/format";
import { DetailSection, Property, PropertyList } from "./DetailSections";
import { cn } from "../../lib/cn";

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

      <DetailSection title="Specification" icon={<Database />} defaultOpen>
        {object.spec ? (
          <StructuredFields value={object.spec as Record<string, unknown>} />
        ) : (
          <div className="text-xs text-theme-text-tertiary">This resource has no spec.</div>
        )}
      </DetailSection>

      <DetailSection title="Status" icon={<Database />} defaultOpen>
        {object.status ? (
          <StructuredFields value={object.status as Record<string, unknown>} />
        ) : (
          <div className="text-xs text-theme-text-tertiary">This resource has no status.</div>
        )}
      </DetailSection>
    </div>
  );
}

function StructuredFields({ value }: { value: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const entries = Object.entries(value ?? {}).sort(([left], [right]) =>
    left.localeCompare(right, undefined, { numeric: true }),
  );
  if (entries.length === 0) {
    return <div className="text-xs text-theme-text-tertiary">No fields.</div>;
  }

  const flat = entries.filter(([, entry]) => entry === null || typeof entry !== "object");
  const nested = entries.filter(([, entry]) => entry !== null && typeof entry === "object");

  const display = (entry: unknown) => {
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
              value={display(entry)}
              mono={typeof entry === "string" && /^[a-z0-9./:_-]+$/i.test(entry) && entry.length < 80}
            />
          ))}
        </PropertyList>
      ) : null}
      {nested.map(([key, entry]) => {
        const open = expanded.has(key);
        const isArray = Array.isArray(entry);
        const count = isArray ? entry.length : Object.keys(entry as object).length;
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
              <pre className="max-h-72 overflow-auto border-t border-theme-border-subtle p-2 font-mono text-[10px] leading-relaxed text-theme-text-secondary">
                {JSON.stringify(entry, null, 2)}
              </pre>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
