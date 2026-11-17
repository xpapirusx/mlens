import { useEffect, useState } from "react";
import { Modal } from "../../design-system/components/Modal";
import { Button } from "../../design-system/components/Button";

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
