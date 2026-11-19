import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Pencil, RefreshCw, Replace, Save, Search, X } from "lucide-react";
import type { KubeObject } from "@shared/types";
import { YamlEditor, type YamlEditorHandle } from "../../design-system/components/YamlEditor";
import { Button } from "../../design-system/components/Button";
import { api, call, errorText } from "../../lib/api";
import { toast } from "../../design-system/components/Toast";
import { objectYaml } from "../../lib/object-yaml";
import { cn } from "../../lib/cn";

export function YamlTab({
  clusterId,
  object,
  onApplied,
  startEditing,
  onEditingStarted,
}: {
  clusterId: string;
  object: KubeObject;
  onApplied: () => void;
  /** Header pencil: open the YAML tab already in edit mode. */
  startEditing?: boolean;
  onEditingStarted?: () => void;
}) {
  // The YAML tab hides the fields the API server owns by default: they are
  // never worth reading and make every other field harder to find. Applying a
  // stripped document is safe — main re-reads the live object and reuses its
  // resourceVersion.
  const [ignoreServerMetadata, setIgnoreServerMetadata] = useState(true);
  const source = useMemo(
    () => objectYaml(object, { ignoreServerMetadata }),
    [object, ignoreServerMetadata],
  );
  const [value, setValue] = useState(source);
  const [editing, setEditing] = useState(Boolean(startEditing));
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const editorRef = useRef<YamlEditorHandle>(null);

  useEffect(() => {
    if (!editing) setValue(source);
  }, [source, editing]);

  useEffect(() => {
    if (!startEditing) return;
    setEditing(true);
    onEditingStarted?.();
  }, [startEditing, onEditingStarted]);

  const apply = async (dryRun: boolean) => {
    setBusy(true);
    try {
      const result = await call(api.resources.apply({ clusterId, yaml: value, dryRun }));
      toast.success(
        dryRun ? "Server dry run succeeded" : `Applied ${result.map((entry) => `${entry.kind}/${entry.name}`).join(", ")}`,
      );
      if (!dryRun) {
        setEditing(false);
        onApplied();
      }
    } catch (error) {
      toast.error(dryRun ? "Dry run failed" : "Apply failed", errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-theme-border bg-theme-base px-2">
        <span className="font-mono text-[calc(10px*var(--font-scale))] text-theme-text-tertiary">
          {object.apiVersion}/{object.kind}
        </span>
        <label
          className={cn(
            "flex min-w-0 items-center gap-1.5 text-[calc(11px*var(--font-scale))] text-theme-text-secondary",
            editing ? "cursor-not-allowed opacity-50" : "cursor-pointer",
          )}
          title={
            editing
              ? "Finish editing to change the YAML view"
              : "Hide server-managed metadata: uid, resourceVersion, generation, creationTimestamp, managedFields, selfLink"
          }
        >
          <input
            type="checkbox"
            checked={ignoreServerMetadata}
            disabled={editing}
            onChange={(event) => setIgnoreServerMetadata(event.target.checked)}
            className="h-3.5 w-3.5 shrink-0 rounded border-theme-border accent-skyhook-500"
          />
          <span className="truncate whitespace-nowrap">Ignore server metadata</span>
        </label>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="xs"
            variant="ghost"
            title="Find in YAML (Ctrl+F · regex toggle inside)"
            onClick={() => editorRef.current?.openFind()}
          >
            <Search className="h-3 w-3" />
            Find
          </Button>
          <Button
            size="xs"
            variant="ghost"
            title={editing ? "Find and replace in YAML" : "Switch to Edit to replace text"}
            onClick={() => {
              if (!editing) {
                setEditing(true);
                // Monaco mounts the editor for the new value first; open the
                // widget on the next frame so it belongs to the editable buffer.
                window.setTimeout(() => editorRef.current?.openReplace(), 120);
                return;
              }
              editorRef.current?.openReplace();
            }}
          >
            <Replace className="h-3 w-3" />
            Replace
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              void navigator.clipboard.writeText(value);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            Copy
          </Button>
          {editing ? (
            <>
              <Button size="xs" variant="ghost" onClick={() => void apply(true)} disabled={busy}>
                <RefreshCw className="h-3 w-3" />
                Dry run
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  setValue(source);
                  setEditing(false);
                }}
              >
                <X className="h-3 w-3" />
                Cancel
              </Button>
              <Button size="xs" variant="primary" onClick={() => void apply(false)} disabled={busy}>
                <Save className="h-3 w-3" />
                {busy ? "Applying…" : "Apply"}
              </Button>
            </>
          ) : (
            <Button size="xs" variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="h-3 w-3" />
              Edit
            </Button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <YamlEditor ref={editorRef} value={value} onChange={setValue} readOnly={!editing} />
      </div>
    </div>
  );
}
