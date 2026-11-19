import { useEffect, useState } from "react";
import { Modal } from "../../design-system/components/Modal";
import { Button } from "../../design-system/components/Button";
import { api, call, errorText } from "../../lib/api";
import { toast } from "../../design-system/components/Toast";

interface Delta {
  set: Record<string, string>;
  remove: string[];
}

/** `key=value` per line; `-key` removes it; `#` comments and blanks are ignored. */
function parseLines(text: string): Delta {
  const set: Record<string, string> = {};
  const remove: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("-")) {
      const key = line.slice(1).trim();
      if (key) remove.push(key);
      continue;
    }
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    set[line.slice(0, separator).trim()] = line.slice(separator + 1);
  }
  return { set, remove };
}

function toLines(value: Record<string, string> | undefined): string {
  return Object.entries(value ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${key}=${entry}`)
    .join("\n");
}

function buildPatch(labels: Delta, annotations: Delta): Record<string, unknown> | null {
  const metadata: Record<string, unknown> = {};
  const labelPatch: Record<string, string | null> = { ...labels.set };
  for (const key of labels.remove) labelPatch[key] = null;
  const annotationPatch: Record<string, string | null> = { ...annotations.set };
  for (const key of annotations.remove) annotationPatch[key] = null;
  if (Object.keys(labelPatch).length > 0) metadata.labels = labelPatch;
  if (Object.keys(annotationPatch).length > 0) metadata.annotations = annotationPatch;
  return Object.keys(metadata).length > 0 ? { metadata } : null;
}

function describe(delta: Delta): string {
  const parts: string[] = [];
  const setCount = Object.keys(delta.set).length;
  if (setCount > 0) parts.push(`+${setCount} set`);
  if (delta.remove.length > 0) parts.push(`−${delta.remove.length} removed`);
  return parts.join(", ");
}

interface DialogObject {
  apiVersion: string;
  kind: string;
  namespace?: string;
  name: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

/**
 * Manual labels/annotations editor. Merge-patch semantics: `key=value` sets or
 * overwrites, `-key` removes the key (the patch sends JSON null), and the
 * confirm step spells out exactly what will change before anything is written.
 */
export function LabelsAnnotationsDialog({
  open,
  onClose,
  clusterId,
  object,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  clusterId: string;
  object: DialogObject | null;
  onSaved?: () => void;
}) {
  const [labels, setLabels] = useState("");
  const [annotations, setAnnotations] = useState("");
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !object) return;
    setLabels(toLines(object.labels));
    setAnnotations(toLines(object.annotations));
    setStep("edit");
    setBusy(false);
  }, [open, object]);

  if (!object) return null;

  const labelDelta = parseLines(labels);
  const annotationDelta = parseLines(annotations);
  const patch = buildPatch(labelDelta, annotationDelta);
  const target = `${object.kind}/${object.name}`;

  const apply = async () => {
    if (!patch) return;
    setBusy(true);
    try {
      await call(
        api.resources.patch({
          clusterId,
          apiVersion: object.apiVersion,
          kind: object.kind,
          namespace: object.namespace,
          name: object.name,
          patch,
        }),
      );
      toast.success("Labels and annotations updated", target);
      onSaved?.();
      onClose();
    } catch (error) {
      toast.error("Update failed", errorText(error));
      setStep("edit");
    } finally {
      setBusy(false);
    }
  };

  const rows: string[] = [];
  const labelSummary = describe(labelDelta);
  const annotationSummary = describe(annotationDelta);
  if (labelSummary) rows.push(`Labels: ${labelSummary}`);
  if (annotationSummary) rows.push(`Annotations: ${annotationSummary}`);
  for (const key of [...labelDelta.remove, ...annotationDelta.remove]) rows.push(`remove ${key}`);

  return (
    <Modal
      open={open}
      onClose={step === "confirm" ? () => setStep("edit") : onClose}
      width={640}
      title={step === "confirm" ? `Apply changes to ${target}?` : `Edit labels & annotations`}
      subtitle={
        step === "confirm"
          ? "A merge patch is sent to the API server."
          : "One entry per line as key=value. Prefix a key with - to remove it. Lines starting with # are ignored."
      }
      footer={
        step === "edit" ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!patch} onClick={() => setStep("confirm")}>
              Apply…
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setStep("edit")} disabled={busy}>
              Back
            </Button>
            <Button variant="primary" onClick={() => void apply()} disabled={busy}>
              {busy ? "Applying…" : "Yes, apply"}
            </Button>
          </>
        )
      }
    >
      {step === "edit" ? (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[calc(11px*var(--font-scale))] font-semibold uppercase tracking-wide text-theme-text-tertiary" htmlFor="labels-editor">
              Labels
            </label>
            <textarea
              id="labels-editor"
              value={labels}
              onChange={(event) => setLabels(event.target.value)}
              spellCheck={false}
              placeholder={"app=web\n-tier=frontend\n# -legacy-key removes it"}
              className="h-40 w-full resize-y rounded-lg border border-theme-border bg-theme-elevated p-2 font-mono text-[calc(11px*var(--font-scale))] leading-5 text-theme-text-primary outline-none focus:border-skyhook-500/60"
            />
          </div>
          <div>
            <label className="mb-1 block text-[calc(11px*var(--font-scale))] font-semibold uppercase tracking-wide text-theme-text-tertiary" htmlFor="annotations-editor">
              Annotations
            </label>
            <textarea
              id="annotations-editor"
              value={annotations}
              onChange={(event) => setAnnotations(event.target.value)}
              spellCheck={false}
              placeholder={"cluster.x-k8s.io/delete-machine=true\niReallyWantDeleteThis=true"}
              className="h-40 w-full resize-y rounded-lg border border-theme-border bg-theme-elevated p-2 font-mono text-[calc(11px*var(--font-scale))] leading-5 text-theme-text-primary outline-none focus:border-skyhook-500/60"
            />
          </div>
          {!patch ? <div className="text-[calc(11px*var(--font-scale))] text-theme-text-tertiary">Nothing to change yet.</div> : null}
        </div>
      ) : (
        <div className="space-y-2 text-sm text-theme-text-secondary">
          <p>
            Update <span className="font-medium text-theme-text-primary">{target}</span>
            {object.namespace ? ` in ${object.namespace}` : ""}?
          </p>
          <ul className="space-y-1 rounded-lg border border-theme-border bg-theme-elevated p-2 font-mono text-[calc(11px*var(--font-scale))] text-theme-text-primary">
            {rows.map((row) => (
              <li key={row}>{row}</li>
            ))}
          </ul>
          <p className="text-[calc(11px*var(--font-scale))] text-theme-text-tertiary">
            Existing keys not listed above stay untouched. Removed keys disappear from the object.
          </p>
        </div>
      )}
    </Modal>
  );
}
