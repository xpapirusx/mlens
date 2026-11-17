import { useMemo, useState } from "react";
import { Copy, Check } from "lucide-react";
import { Modal } from "../../design-system/components/Modal";
import { Button } from "../../design-system/components/Button";
import { toast } from "../../design-system/components/Toast";

type Separator = "newline" | "," | ";";

const SEPARATORS: Array<{ value: Separator; label: string; hint: string }> = [
  { value: "newline", label: "Line breaks", hint: "one name per line" },
  { value: ",", label: "Comma", hint: "name, name, name" },
  { value: ";", label: "Semicolon", hint: "name; name; name" },
];

/**
 * Copies the selected resource names with the separator of choice — the
 * "give me these names for a script" action behind the selection bar.
 */
export function CopyNamesDialog({
  open,
  onClose,
  items,
}: {
  open: boolean;
  onClose: () => void;
  items: Array<{ name: string; namespace?: string }>;
}) {
  const [separator, setSeparator] = useState<Separator>("newline");
  const [withNamespace, setWithNamespace] = useState(false);
  const [copied, setCopied] = useState(false);

  const text = useMemo(() => {
    const entries = items.map((item) =>
      withNamespace && item.namespace ? `${item.namespace}/${item.name}` : item.name,
    );
    const joiner = separator === "newline" ? "\n" : separator === "," ? ", " : "; ";
    return entries.join(joiner);
  }, [items, separator, withNamespace]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(`Copied ${items.length} name${items.length === 1 ? "" : "s"}`);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Cannot access the clipboard");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={560}
      title={`Copy ${items.length} name${items.length === 1 ? "" : "s"}`}
      subtitle="Pick how the names are joined, then copy the result."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" onClick={() => void copy()}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] uppercase tracking-wide text-theme-text-tertiary">Separate by</span>
          {SEPARATORS.map((option) => (
            <button
              key={option.value}
              type="button"
              title={option.hint}
              onClick={() => setSeparator(option.value)}
              className={
                separator === option.value
                  ? "rounded-md border border-skyhook-500/50 bg-skyhook-500/15 px-2 py-1 text-[11px] text-accent-text"
                  : "rounded-md border border-theme-border bg-theme-elevated px-2 py-1 text-[11px] text-theme-text-secondary hover:bg-theme-hover"
              }
            >
              {option.label}
            </button>
          ))}
          <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[11px] text-theme-text-secondary">
            <input
              type="checkbox"
              checked={withNamespace}
              onChange={(event) => setWithNamespace(event.target.checked)}
              className="h-3.5 w-3.5 rounded border-theme-border accent-skyhook-500"
            />
            namespace/name
          </label>
        </div>
        <textarea
          readOnly
          value={text}
          onFocus={(event) => event.currentTarget.select()}
          className="h-56 w-full resize-none rounded-lg border border-theme-border bg-theme-elevated p-2 font-mono text-[11px] leading-5 text-theme-text-primary outline-none"
        />
      </div>
    </Modal>
  );
}
