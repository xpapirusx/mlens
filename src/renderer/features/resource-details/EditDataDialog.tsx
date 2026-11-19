import { useEffect, useState } from "react";
import type { KubeObject } from "@shared/types";
import { Modal } from "../../design-system/components/Modal";
import { Button } from "../../design-system/components/Button";
import { Plus, Trash2 } from "lucide-react";
import { api, call, errorText } from "../../lib/api";
import { toast } from "../../design-system/components/Toast";

interface Row {
  id: number;
  key: string;
  value: string;
  binary: boolean;
}

let nextId = 1;

function decodeBase64(value: string): { text: string; binary: boolean } {
  try {
    const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { text, binary: false };
  } catch {
    return { text: value, binary: true };
  }
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function EditDataDialog({
  open,
  onClose,
  clusterId,
  object,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  clusterId: string;
  object: KubeObject | null;
  onSaved: () => void;
}) {
  const isSecret = object?.kind === "Secret";
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !object) return;
    const data = (object.data ?? {}) as Record<string, string>;
    setRows(
      Object.entries(data).map(([key, value]) => {
        if (isSecret) {
          const decoded = decodeBase64(value);
          return { id: nextId++, key, value: decoded.text, binary: decoded.binary };
        }
        return { id: nextId++, key, value, binary: false };
      }),
    );
  }, [open, object, isSecret]);

  if (!object) return null;

  const update = (id: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const save = async () => {
    const data: Record<string, string | null> = {};
    const seen = new Set<string>();
    for (const row of rows) {
      const key = row.key.trim();
      if (!key) continue;
      seen.add(key);
      data[key] = isSecret && !row.binary ? encodeBase64(row.value) : row.value;
    }
    for (const key of Object.keys((object.data ?? {}) as Record<string, string>)) {
      if (!seen.has(key)) data[key] = null;
    }

    setBusy(true);
    try {
      await call(
        api.resources.patch({
          clusterId,
          apiVersion: object.apiVersion,
          kind: object.kind,
          namespace: object.metadata?.namespace,
          name: object.metadata?.name,
          patch: { data },
        }),
      );
      toast.success(`${object.kind} updated`);
      onSaved();
      onClose();
    } catch (error) {
      toast.error("Cannot update data", errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={760}
      title={`Edit ${object.kind}`}
      subtitle={
        isSecret
          ? "Values are shown base64-decoded and encoded again when saving."
          : "Data values are stored as plain strings."
      }
      footer={
        <>
          <Button variant="ghost" onClick={() => setRows((current) => [...current, { id: nextId++, key: "", value: "", binary: false }])}>
            <Plus className="h-3.5 w-3.5" />
            Add key
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save data"}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)_32px] gap-2 border-b border-theme-border pb-1 text-[calc(10px*var(--font-scale))] uppercase tracking-wide text-theme-text-tertiary">
          <span>Key</span>
          <span>Value</span>
          <span />
        </div>
        {rows.map((row) => (
          <div key={row.id} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)_32px] items-start gap-2">
            <input
              value={row.key}
              onChange={(event) => update(row.id, { key: event.target.value })}
              spellCheck={false}
              className="h-8 w-full rounded border border-theme-border bg-theme-elevated px-2 font-mono text-[calc(11px*var(--font-scale))] text-theme-text-primary focus:outline-none focus:ring-1 focus:ring-skyhook-500"
            />
            <textarea
              value={row.value}
              onChange={(event) => update(row.id, { value: event.target.value })}
              spellCheck={false}
              rows={2}
              className="min-h-8 w-full resize-y rounded border border-theme-border bg-theme-elevated px-2 py-1 font-mono text-[calc(11px*var(--font-scale))] leading-relaxed text-theme-text-primary focus:outline-none focus:ring-1 focus:ring-skyhook-500"
            />
            <button
              type="button"
              className="mt-1 rounded p-1 text-theme-text-tertiary hover:bg-theme-hover hover:text-red-500"
              title="Remove key"
              onClick={() => setRows((current) => current.filter((entry) => entry.id !== row.id))}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {rows.length === 0 ? (
          <div className="py-6 text-center text-xs text-theme-text-tertiary">No keys. Add one to start.</div>
        ) : null}
      </div>
      <p className="mt-3 text-[calc(10px*var(--font-scale))] text-theme-text-tertiary">
        Saving sends a merge patch on <span className="inline-code">data</span>. Removed keys are deleted.
      </p>
    </Modal>
  );
}
