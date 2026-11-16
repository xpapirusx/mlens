import { useEffect, useMemo, useState } from "react";
import type { ApiResourceInfo } from "@shared/types";
import { Modal } from "../../design-system/components/Modal";
import { Button } from "../../design-system/components/Button";
import { YamlEditor } from "../../design-system/components/YamlEditor";
import { api, call, errorText } from "../../lib/api";
import { toast } from "../../design-system/components/Toast";

function skeleton(resource: ApiResourceInfo, namespace: string): string {
  const ns = namespace !== "all" ? namespace : "default";
  const lines = [
    `apiVersion: ${resource.apiVersion}`,
    `kind: ${resource.kind}`,
    "metadata:",
    "  name: example",
  ];
  if (resource.namespaced) lines.push(`  namespace: ${ns}`);
  lines.push("  labels:", "    app.kubernetes.io/managed-by: mlens");
  if (resource.kind === "ConfigMap") lines.push("data:", "  key: value");
  else if (resource.kind === "Secret") lines.push("stringData:", "  key: value");
  else if (resource.kind === "Namespace" || resource.kind === "Node") lines.push("spec: {}");
  else lines.push("spec: {}");
  return `${lines.join("\n")}\n`;
}

export function CreateResourceDialog({
  open,
  onClose,
  clusterId,
  resource,
  namespace,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  clusterId: string;
  resource: ApiResourceInfo;
  namespace: string;
  onCreated: () => void;
}) {
  const initial = useMemo(() => skeleton(resource, namespace), [resource, namespace]);
  const [yaml, setYaml] = useState(initial);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setYaml(initial);
  }, [open, initial]);

  const apply = async (dryRun: boolean) => {
    setBusy(true);
    try {
      const results = await call(api.resources.apply({ clusterId, yaml, dryRun }));
      if (dryRun) {
        toast.success("YAML is valid", "Server-side dry run succeeded.");
      } else {
        toast.success(
          results.map((result) => `${result.kind}/${result.name} ${result.action}`).join("\n") || "Applied",
        );
        onCreated();
        onClose();
      }
    } catch (error) {
      toast.error(dryRun ? "Dry run failed" : "Apply failed", errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={860}
      title={`Create ${resource.kind}`}
      subtitle={`${resource.apiVersion} · server-side validated before applying`}
      footer={
        <>
          <Button variant="ghost" onClick={() => void apply(true)} disabled={busy}>
            Dry run
          </Button>
          <Button variant="primary" onClick={() => void apply(false)} disabled={busy}>
            {busy ? "Applying…" : "Apply"}
          </Button>
        </>
      }
    >
      <div className="h-[52vh] overflow-hidden rounded-lg border border-theme-border">
        <YamlEditor value={yaml} onChange={setYaml} readOnly={false} />
      </div>
    </Modal>
  );
}

export function ScaleDialog({
  open,
  onClose,
  onConfirm,
  title,
  current,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (replicas: number) => void;
  title: string;
  current: number;
  busy?: boolean;
}) {
  const [value, setValue] = useState(String(current));

  useEffect(() => {
    if (open) setValue(String(current));
  }, [open, current]);

  const parsed = Number(value);
  const valid = Number.isInteger(parsed) && parsed >= 0 && parsed <= 10000;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={420}
      title="Scale resource"
      subtitle={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid || busy} onClick={() => onConfirm(parsed)}>
            {busy ? "Scaling…" : "Scale"}
          </Button>
        </>
      }
    >
      <label className="block text-xs font-medium text-theme-text-secondary" htmlFor="scale-replicas">
        Replicas
      </label>
      <input
        id="scale-replicas"
        type="number"
        min={0}
        value={value}
        autoFocus
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && valid) onConfirm(parsed);
        }}
        className="mt-1 h-8 w-full rounded-md border border-theme-border bg-theme-elevated px-2 text-sm text-theme-text-primary focus:outline-none focus:ring-2 focus:ring-skyhook-500/60"
      />
      <p className="mt-2 text-[11px] text-theme-text-tertiary">
        Uses a merge patch on <span className="inline-code">spec.replicas</span>. Zero scales the workload down.
      </p>
    </Modal>
  );
}

export function ConfirmActionDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  danger,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={440}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-theme-text-secondary">{description}</div>
    </Modal>
  );
}
