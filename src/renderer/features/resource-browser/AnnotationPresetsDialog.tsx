import { useEffect, useState } from "react";
import { Modal } from "../../design-system/components/Modal";
import { Button } from "../../design-system/components/Button";
import { useCatalogStore } from "../../stores/catalog-store";
import { toast } from "../../design-system/components/Toast";

/**
 * Editor for the saved annotations behind the bulk "Annotate" action: one
 * `key=value` entry per line, persisted in `settings.annotationPresets`.
 */
export function AnnotationPresetsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useCatalogStore((state) => state.settings);
  const updateSettings = useCatalogStore((state) => state.updateSettings);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const presets = settings?.annotationPresets ?? {};
    setText(
      Object.entries(presets)
        .map(([key, value]) => `${key}=${value}`)
        .sort((left, right) => left.localeCompare(right))
        .join("\n"),
    );
    // Deliberately keyed on `open`: the list is a snapshot, so typing is not
    // clobbered by a settings refresh arriving while the dialog is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = async () => {
    const presets: Record<string, string> = {};
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const separator = line.indexOf("=");
      if (separator <= 0) continue;
      presets[line.slice(0, separator).trim()] = line.slice(separator + 1);
    }
    setBusy(true);
    try {
      await updateSettings({ annotationPresets: presets });
      toast.success("Annotations saved", `${Object.keys(presets).length} entr${Object.keys(presets).length === 1 ? "y" : "ies"}`);
      onClose();
    } catch {
      // updateSettings already toasts the failure.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={600}
      title="Saved annotations"
      subtitle="Offered by the Annotate action in the selection bar. One entry per line as key=value; # lines are ignored."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        spellCheck={false}
        placeholder={"iReallyWantDeleteThis=true\ncluster.x-k8s.io/delete-machine=true"}
        className="h-64 w-full resize-y rounded-lg border border-theme-border bg-theme-elevated p-2 font-mono text-[11px] leading-5 text-theme-text-primary outline-none focus:border-skyhook-500/60"
      />
      <p className="mt-2 text-[11px] text-theme-text-tertiary">
        Saved in mLens settings, not on the cluster. Applying an annotation writes a merge patch to each selected
        resource.
      </p>
    </Modal>
  );
}
