import { useState } from "react";
import { Box, Eye, FileText, History, Info, RotateCcw } from "lucide-react";
import { DetailSection, Property, PropertyList } from "./DetailSections";
import { Modal } from "../../design-system/components/Modal";
import { Button } from "../../design-system/components/Button";
import { formatAge, formatTimestamp } from "../../lib/format";
import { cn } from "../../lib/cn";
import { HELM_STATUS_TONES } from "../../lib/columns";
import { api, call, errorText } from "../../lib/api";
import { toast } from "../../design-system/components/Toast";
import type { HelmReleaseDetail } from "@shared/types";
import type { OverviewProps } from "./OverviewTab";

function TextBlock({ text, empty }: { text: string; empty: string }) {
  if (!text.trim()) return <div className="text-xs text-theme-text-tertiary">{empty}</div>;
  return (
    <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-theme-border bg-theme-base p-2 font-mono text-[11px] leading-5 text-theme-text-secondary">
      {text}
    </pre>
  );
}

const ROW_BUTTON =
  "flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-colors";
const VIEW_BUTTON =
  "border-theme-border-light bg-theme-elevated text-theme-text-secondary hover:bg-theme-hover hover:text-theme-text-primary";
const ROLLBACK_BUTTON =
  "border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300";

/**
 * Helm release overview: the record read out of the `owner=helm` secret —
 * status/revision/chart, the revision timeline with rollback (Radar's
 * RevisionHistory design), the objects the manifest creates, and the deployed
 * values/manifests. "View" swaps the values/manifests to an older revision;
 * rollback re-applies that revision's manifest and appends a new record.
 *
 * There is no chart renderer here: a true `helm upgrade` would need Helm's
 * template engine, which mLens deliberately does not ship.
 */
export function HelmReleaseOverview({ object, clusterId, onNavigate, onRefresh }: OverviewProps) {
  const status = (object.status ?? {}) as Record<string, any>;
  const spec = (object.spec ?? {}) as Record<string, any>;
  const metadata = object.metadata ?? {};
  const phase = String(status.phase ?? "unknown");
  const truncated = Boolean(object.truncated);
  const namespace = String(metadata.namespace ?? "");
  const name = String(metadata.name ?? "");

  const revisions = (object.revisions ?? []) as HelmReleaseDetail["revisions"];
  const resources = (object.resources ?? []) as HelmReleaseDetail["resources"];
  const currentRevision = Number(spec.revision ?? 1);

  const [viewed, setViewed] = useState<HelmReleaseDetail | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const shown = viewed ?? object;
  const shownValues = String(shown.values ?? "");
  const shownManifest = String(shown.manifest ?? "");

  const viewRevision = async (revision: number) => {
    if (revision === currentRevision) {
      setViewed(null);
      return;
    }
    setBusy(true);
    try {
      setViewed(await call(api.helm.get({ clusterId, namespace, name, revision })));
    } catch (error) {
      toast.error("Cannot load that revision", errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const rollback = async (revision: number) => {
    setBusy(true);
    try {
      await call(api.helm.rollback({ clusterId, namespace, name, revision }));
      toast.success(`Rolled back to revision ${revision}`, `${namespace}/${name}`);
      setViewed(null);
      onRefresh?.();
    } catch (error) {
      toast.error("Rollback failed", errorText(error));
    } finally {
      setBusy(false);
      setRollbackTarget(null);
    }
  };

  return (
    <div className="space-y-4">
      {viewed ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-skyhook-500/30 bg-skyhook-500/10 px-3 py-2 text-[12px] text-sky-700 dark:text-sky-300">
          <span>
            Viewing revision {viewed.viewedRevision} — values and manifests below are from that revision.
          </span>
          <button
            type="button"
            className="shrink-0 font-medium underline hover:no-underline"
            onClick={() => setViewed(null)}
          >
            Back to current
          </button>
        </div>
      ) : null}

      <DetailSection title="Release" icon={<Info />}>
        <PropertyList>
          <Property
            label="Status"
            value={<span className={cn("badge", HELM_STATUS_TONES[phase] ?? "status-unknown")}>{phase}</span>}
          />
          <Property label="Namespace" value={namespace} copyable />
          <Property label="Revision" value={currentRevision} />
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

      <DetailSection title={`Revisions (${revisions.length})`} icon={<History />} count={revisions.length}>
        <div className="space-y-2">
          {revisions.map((revision) => {
            const isCurrent = revision.revision === currentRevision;
            const isViewing = revision.revision === (viewed?.viewedRevision ?? currentRevision);
            return (
              <div
                key={revision.revision}
                className={cn(
                  "relative rounded-lg border p-3 transition-colors",
                  isCurrent
                    ? "border-emerald-500/50 bg-emerald-500/5"
                    : isViewing
                      ? "border-skyhook-500/50 bg-skyhook-500/10"
                      : "border-theme-border-subtle bg-theme-base hover:border-theme-border",
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      isCurrent
                        ? "bg-emerald-500 text-white"
                        : "bg-theme-elevated text-theme-text-secondary",
                    )}
                  >
                    {revision.revision}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-theme-text-primary">
                        {revision.chart}
                      </span>
                      <span className={cn("badge-sm", HELM_STATUS_TONES[revision.status] ?? "status-unknown")}>
                        {revision.status}
                      </span>
                      {isCurrent ? <span className="badge-sm status-healthy">Current</span> : null}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-theme-text-tertiary">
                      <span title={revision.deployedAt ?? ""}>
                        {revision.deployedAt ? formatTimestamp(revision.deployedAt) : "–"}
                      </span>
                      <span>{formatAge(revision.deployedAt)}</span>
                    </div>
                    {revision.description ? (
                      <p className="mt-1 truncate text-sm text-theme-text-secondary">{revision.description}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className={cn(ROW_BUTTON, VIEW_BUTTON)}
                        onClick={() => void viewRevision(revision.revision)}
                        disabled={busy}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        {isViewing && !isCurrent ? "Viewing" : "View"}
                      </button>
                      {!isCurrent ? (
                        <button
                          type="button"
                          className={cn(ROW_BUTTON, ROLLBACK_BUTTON)}
                          onClick={() => setRollbackTarget(revision.revision)}
                          disabled={busy}
                          title={`Roll back to revision ${revision.revision}`}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Rollback
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </DetailSection>

      {resources.length > 0 ? (
        <DetailSection title="Resources" icon={<Box />} count={resources.length}>
          <div className="max-h-64 space-y-0.5 overflow-y-auto pr-1">
            {resources
              .slice()
              .sort((left, right) => left.kind.localeCompare(right.kind) || left.name.localeCompare(right.name))
              .map((entry) => (
                <button
                  key={`${entry.apiVersion}|${entry.kind}|${entry.namespace ?? ""}|${entry.name}`}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-theme-hover"
                  onClick={() => onNavigate(entry.kind, entry.name, entry.namespace, entry.apiVersion)}
                  title={`Open ${entry.kind}/${entry.name}`}
                >
                  <span className="badge-sm status-violet shrink-0">{entry.kind}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-theme-text-primary">
                    {entry.name}
                  </span>
                  {entry.namespace && entry.namespace !== namespace ? (
                    <span className="shrink-0 text-[11px] text-theme-text-tertiary">{entry.namespace}</span>
                  ) : null}
                </button>
              ))}
          </div>
          {resources.length > 60 ? (
            <div className="mt-1 text-[11px] text-theme-text-tertiary">
              Showing the first {resources.length} objects of this manifest.
            </div>
          ) : null}
        </DetailSection>
      ) : null}

      <DetailSection title="Values" icon={<Box />}>
        <TextBlock text={shownValues} empty="This release was deployed without custom values." />
      </DetailSection>

      <DetailSection title="Manifests" icon={<FileText />}>
        <TextBlock text={shownManifest} empty="No rendered manifests are stored with this release." />
        {truncated ? (
          <div className="mt-1.5 text-[11px] text-theme-text-tertiary">
            Values/manifests were cut short for display; the full text stays in the Secret.
          </div>
        ) : null}
      </DetailSection>

      <Modal
        open={rollbackTarget !== null}
        onClose={() => setRollbackTarget(null)}
        width={540}
        title={`Roll back to revision ${rollbackTarget ?? "?"}`}
        subtitle={`${namespace}/${name}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRollbackTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (rollbackTarget !== null) void rollback(rollbackTarget);
              }}
              disabled={busy}
            >
              {busy ? "Rolling back…" : "Roll back"}
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-sm text-theme-text-secondary">
          <p>
            That revision's stored manifest is re-applied to the cluster and recorded as a{" "}
            <span className="font-medium text-theme-text-primary">new revision</span> — history stays
            append-only, exactly like Helm.
          </p>
          <p className="text-[11px] text-theme-text-tertiary">
            Nothing is deleted: the current revision's record and values remain in their Secrets and can be
            rolled forward to again.
          </p>
        </div>
      </Modal>
    </div>
  );
}
