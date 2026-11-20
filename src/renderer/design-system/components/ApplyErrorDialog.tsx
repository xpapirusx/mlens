import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, CircleExclamationPoint, Copy, X } from "lucide-react";
import { Button } from "./Button";

export interface ApplyErrorDetails {
  title: string;
  message: string;
  hint?: string;
}

const DEFAULT_HINT =
  "The server rejected the manifest. Your YAML is unchanged — fix it and apply again, or copy the error.";

/**
 * YAML apply failures get a real surface instead of a toast: server validation
 * output can span dozens of lines (one line per bad field, multi-document
 * failures) and is usually pasted into an issue or a terminal. The dialog keeps
 * the full text selectable and scrollable, copies it in one click, and closing
 * it leaves the editor buffer exactly as it was.
 */
export function ApplyErrorDialog({
  error,
  onClose,
}: {
  error: ApplyErrorDetails | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!error) {
      setCopied(false);
      return;
    }
    setCopied(false);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Capture phase: the dialog can be stacked above another Modal (the node
      // debug shell), whose own Escape handler must not close both surfaces.
      event.stopImmediatePropagation();
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [error, onClose]);

  if (!error) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(error.message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied; the text stays selectable by hand.
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/45 p-8 backdrop-blur-[1px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={error.title}
        className="dialog relative my-12 flex max-h-[calc(100vh-6rem)] w-full max-w-3xl flex-col overflow-hidden"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-theme-border px-5 py-4">
          <CircleExclamationPoint className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[calc(15px*var(--font-scale))] font-semibold text-theme-text-primary">
              {error.title}
            </h2>
            <p className="mt-0.5 text-xs text-theme-text-tertiary">{error.hint ?? DEFAULT_HINT}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close error dialog">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <pre className="max-h-[52vh] select-text overflow-auto whitespace-pre-wrap break-words rounded-lg border border-theme-border bg-theme-elevated p-3 font-mono text-[calc(11px*var(--font-scale))] leading-5 text-theme-text-primary">
            {error.message}
          </pre>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-theme-border bg-theme-base/60 px-5 py-3">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" onClick={() => void copy()}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy error"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
