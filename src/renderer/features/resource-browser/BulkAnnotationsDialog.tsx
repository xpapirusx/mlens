import { useEffect, useMemo, useState } from "react";
import { Check, Tags } from "lucide-react";
import { Modal } from "../../design-system/components/Modal";
import { Button } from "../../design-system/components/Button";

/**
 * Annotate several selected resources with one or more saved annotations.
 * Checkboxes choose the keys; every chosen key goes into a single merge patch
 * per resource, so unrelated annotations stay untouched.
 */
export function BulkAnnotationsDialog({
  open,
  onClose,
  presets,
  targetCount,
  kind,
  busy,
  onApply,
  onManage,
}: {
  open: boolean;
  onClose: () => void;
  presets: Array<[string, string]>;
  targetCount: number;
  kind: string;
  busy: boolean;
  onApply: (keys: string[]) => void;
  onManage: () => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // Every opening starts with nothing ticked; presets may have changed since
  // the previous dialog (the editor lives behind "Manage annotations…").
  useEffect(() => {
    if (open) setPicked(new Set());
  }, [open]);

  const allPicked = presets.length > 0 && picked.size === presets.length;
  const chosenKeys = useMemo(
    () => presets.filter(([key]) => picked.has(key)).map(([key]) => key),
    [presets, picked],
  );

  const toggle = (key: string) => {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    setPicked(allPicked ? new Set() : new Set(presets.map(([key]) => key)));
  };

  const noun = targetCount === 1 ? kind : `${kind}s`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={560}
      title={`Annotate ${targetCount} ${noun}`}
      subtitle="Tick the saved annotations to apply. A merge patch adds these keys and leaves every other annotation alone."
      footer={
        <>
          <Button variant="ghost" className="mr-auto" onClick={onManage}>
            Manage annotations…
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy || chosenKeys.length === 0 || targetCount === 0}
            onClick={() => onApply(chosenKeys)}
          >
            <Tags className="h-3.5 w-3.5" />
            {busy
              ? "Applying…"
              : `Annotate ${targetCount} · ${chosenKeys.length} key${chosenKeys.length === 1 ? "" : "s"}`}
          </Button>
        </>
      }
    >
      {presets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-theme-border px-4 py-6 text-center">
          <div className="text-sm font-medium text-theme-text-primary">No saved annotations</div>
          <div className="mt-1 text-xs text-theme-text-tertiary">
            Add <span className="font-mono">key=value</span> entries in{" "}
            <button type="button" className="text-accent-text hover:underline" onClick={onManage}>
              Manage annotations…
            </button>{" "}
            to reuse them here.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wide text-theme-text-tertiary">
              {presets.length} saved annotation{presets.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={toggleAll}
              className="text-[11px] text-accent-text hover:underline"
            >
              {allPicked ? "Clear all" : "Select all"}
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-theme-border">
            {presets.map(([key, value]) => {
              const active = picked.has(key);
              return (
                <label
                  key={key}
                  className="flex cursor-pointer items-start gap-2 border-b border-theme-border px-2.5 py-2 last:border-b-0 hover:bg-theme-hover"
                  title={`${key}=${value}`}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggle(key)}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-theme-border accent-skyhook-500"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-mono text-[11px] text-theme-text-primary">{key}</span>
                      {active ? <Check className="h-3 w-3 shrink-0 text-emerald-500" /> : null}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-theme-text-tertiary">
                      {value || "—"}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          <p className="text-[11px] text-theme-text-tertiary">
            {chosenKeys.length === 0
              ? "Pick at least one annotation."
              : `${chosenKeys.length} key${chosenKeys.length === 1 ? "" : "s"} will be written to ${targetCount} resource${targetCount === 1 ? "" : "s"}. Selection stays after apply.`}
          </p>
        </div>
      )}
    </Modal>
  );
}
