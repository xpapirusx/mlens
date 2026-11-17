import { Box, FileText, Info } from "lucide-react";
import { DetailSection, Property, PropertyList } from "./DetailSections";
import { formatAge, formatTimestamp } from "../../lib/format";
import { cn } from "../../lib/cn";
import { HELM_STATUS_TONES } from "../../lib/columns";
import type { OverviewProps } from "./OverviewTab";

function TextBlock({ text, empty }: { text: string; empty: string }) {
  if (!text.trim()) return <div className="text-xs text-theme-text-tertiary">{empty}</div>;
  return (
    <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-theme-border bg-theme-base p-2 font-mono text-[11px] leading-5 text-theme-text-secondary">
      {text}
    </pre>
  );
}

/**
 * Helm release overview: the release record read out of the `owner=helm`
 * secret — status/revision/chart plus the deployed values and rendered
 * manifests, which stand in for the YAML tab (there is no API resource to
 * re-apply from).
 */
export function HelmReleaseOverview({ object }: OverviewProps) {
  const status = (object.status ?? {}) as Record<string, any>;
  const spec = (object.spec ?? {}) as Record<string, any>;
  const metadata = object.metadata ?? {};
  const phase = String(status.phase ?? "unknown");
  const truncated = Boolean(object.truncated);

  return (
    <div className="space-y-4">
      <DetailSection title="Release" icon={<Info />}>
        <PropertyList>
          <Property
            label="Status"
            value={
              <span className={cn("badge", HELM_STATUS_TONES[phase] ?? "status-unknown")}>{phase}</span>
            }
          />
          <Property label="Namespace" value={metadata.namespace} copyable />
          <Property label="Revision" value={spec.revision ?? 1} />
          <Property
            label="Deployed"
            value={status.deployedAt ? formatTimestamp(status.deployedAt) : "–"}
            mono
          />
          <Property label="Chart" value={spec.chart} mono copyable />
          <Property label="Chart version" value={spec.chartVersion || "–"} mono />
          <Property label="App version" value={spec.appVersion || "–"} mono />
          <Property label="Description" value={status.description || "–"} />
          <Property label="Secret" value={status.secretName} mono />
          <Property label="Age" value={formatAge(metadata.creationTimestamp)} />
        </PropertyList>
      </DetailSection>

      <DetailSection title="Values" icon={<Box />}>
        <TextBlock
          text={String(object.values ?? "")}
          empty="This release was deployed without custom values."
        />
      </DetailSection>

      <DetailSection title="Manifests" icon={<FileText />}>
        <TextBlock
          text={String(object.manifest ?? "")}
          empty="No rendered manifests are stored with this release."
        />
        {truncated ? (
          <div className="mt-1.5 text-[11px] text-theme-text-tertiary">
            Values/manifests were cut short for display; the full text stays in the Secret.
          </div>
        ) : null}
      </DetailSection>
    </div>
  );
}
