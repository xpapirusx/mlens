import { useState } from "react";
import { FileCode } from "lucide-react";
import { YamlEditor } from "../../design-system/components/YamlEditor";
import { api, call, errorText } from "../../lib/api";
import { toast } from "../../design-system/components/Toast";
import { ApplyErrorDialog, type ApplyErrorDetails } from "../../design-system/components/ApplyErrorDialog";
import { cn } from "../../lib/cn";

const BUTTON =
  "rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[calc(11px*var(--font-scale))] text-slate-200 transition-colors hover:bg-white/10 disabled:opacity-40";
const BUTTON_PRIMARY =
  "rounded-md border border-skyhook-500/50 bg-skyhook-500/20 px-2 py-0.5 text-[calc(11px*var(--font-scale))] text-sky-200 transition-colors hover:bg-skyhook-500/30 disabled:opacity-40";

function documentCount(yaml: string): number {
  if (!yaml.trim()) return 0;
  return yaml
    .split(/^\s*---\s*$/m)
    .filter((chunk) => chunk.trim() && !chunk.trim().startsWith("#"))
    .length;
}

/**
 * The dock's "create resource" surface: a multi-document YAML editor that
 * applies through the same server-side-checked path as the Create dialog, but
 * lives at the bottom next to the terminals so a pasted manifest never blocks
 * the table. Accepts one document or several separated by `---`; an existing
 * kind/name is replaced (PUT) with the pasted document.
 */
export function YamlDockTab({ clusterId, active }: { clusterId: string; active: boolean }) {
  const [yaml, setYaml] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<ApplyErrorDetails | null>(null);

  const apply = async (dryRun: boolean) => {
    if (!yaml.trim()) {
      toast.error("Nothing to apply", "Paste a YAML manifest first.");
      return;
    }
    setApplyError(null);
    setBusy(true);
    try {
      const results = await call(api.resources.apply({ clusterId, yaml, dryRun }));
      if (dryRun) {
        const summary = results.map((entry) => `${entry.kind}/${entry.name}`).join(", ");
        setLastRun(`Dry run OK — ${summary || "documents are valid"}`);
        toast.success("Server dry run succeeded", summary || undefined);
      } else {
        const summary = results.map((entry) => `${entry.kind}/${entry.name} ${entry.action}`).join("\n");
        setLastRun(`Applied ${results.length} object${results.length === 1 ? "" : "s"}`);
        toast.success(summary || "Applied");
        setYaml("");
        // Tell any mounted resource tables to refetch — the dock does not know
        // which browser is open, so the list listens for this instead.
        window.dispatchEvent(new CustomEvent("mlens:resources-applied"));
      }
    } catch (error) {
      setLastRun(`${dryRun ? "Dry run" : "Apply"} failed`);
      setApplyError({
        title: dryRun ? "Dry run failed" : "Apply failed",
        message: errorText(error),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("flex h-full min-h-0 flex-col", !active && "hidden")}>
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-white/10 bg-[#111b2e] px-2">
        <FileCode className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span className="text-[calc(11px*var(--font-scale))] text-slate-300">Create from YAML</span>
        <span className="hidden truncate text-[calc(10px*var(--font-scale))] text-slate-500 sm:inline">
          one document, or several separated by ---
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            className={BUTTON}
            disabled={busy || !yaml}
            onClick={() => {
              setYaml("");
              setLastRun(null);
              setApplyError(null);
            }}
          >
            Clear
          </button>
          <button type="button" className={BUTTON} disabled={busy} onClick={() => void apply(true)}>
            Dry run
          </button>
          <button type="button" className={BUTTON_PRIMARY} disabled={busy} onClick={() => void apply(false)}>
            {busy ? "Applying…" : "Apply"}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <YamlEditor value={yaml} onChange={setYaml} readOnly={false} />
      </div>

      <div className="flex h-6 shrink-0 items-center gap-3 border-t border-white/10 bg-[#111b2e] px-3 text-[calc(10px*var(--font-scale))] text-slate-500">
        <span className="shrink-0">
          {documentCount(yaml)} document{documentCount(yaml) === 1 ? "" : "s"}
        </span>
        <span className="truncate text-slate-400">
          {lastRun ??
            "Apply creates missing objects and overwrites existing ones after a server-side check."}
        </span>
      </div>

      <ApplyErrorDialog error={applyError} onClose={() => setApplyError(null)} />
    </div>
  );
}
