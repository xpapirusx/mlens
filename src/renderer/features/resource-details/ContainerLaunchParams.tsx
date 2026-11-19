import { useState } from "react";
import { ChevronRight, Copy } from "lucide-react";
import { cn } from "../../lib/cn";

/** Quotes a scalar only when plain YAML would be ambiguous. */
function yamlScalar(value: string): string {
  const needsQuotes =
    value === "" ||
    /^[\s\-?:,[\]{}#&*!|>'"%@`]/.test(value) ||
    /\s$/.test(value) ||
    /[:#\n"']/.test(value) ||
    /^(true|false|null|yes|no|on|off|~)$/i.test(value);
  return needsQuotes ? JSON.stringify(value) : value;
}

function toYaml(command: string[], args: string[]): string {
  const lines: string[] = [];
  if (command.length > 0) {
    lines.push("command:", ...command.map((entry) => `  - ${yamlScalar(entry)}`));
  }
  if (args.length > 0) {
    lines.push("args:", ...args.map((entry) => `  - ${yamlScalar(entry)}`));
  }
  return lines.join("\n");
}

/**
 * Launch parameters (command + args) of one container, rendered as the YAML the
 * manifest carries and collapsed by default — Radar keeps the container card
 * compact and reveals the entrypoint on demand. Containers that inherit the
 * image entrypoint render nothing.
 */
export function ContainerLaunchParams({ container }: { container: Record<string, any> }) {
  const [open, setOpen] = useState(false);
  const command: string[] = Array.isArray(container.command) ? container.command : [];
  const args: string[] = Array.isArray(container.args) ? container.args : [];
  if (command.length === 0 && args.length === 0) return null;

  const yaml = toYaml(command, args);
  const summary = [
    command.length > 0 ? `${command.length} cmd` : "",
    args.length > 0 ? `${args.length} args` : "",
  ].filter(Boolean);

  return (
    <div className="mt-1.5">
      <button
        type="button"
        className="flex items-center gap-1 rounded text-[calc(11px*var(--font-scale))] text-theme-text-tertiary transition-colors hover:text-theme-text-primary"
        onClick={() => setOpen((value) => !value)}
        title={open ? "Hide command and arguments" : "Show command and arguments"}
        aria-expanded={open}
      >
        <ChevronRight className={cn("h-3 w-3 shrink-0 transition-transform", open && "rotate-90")} />
        <span>Launch parameters</span>
        <span className="font-mono text-[calc(10px*var(--font-scale))] text-theme-text-disabled">{summary.join(" · ")}</span>
      </button>
      {open ? (
        <div className="group relative mt-1 rounded-md border border-theme-border-subtle bg-theme-base">
          <button
            type="button"
            className="absolute right-1 top-1 rounded p-0.5 text-theme-text-tertiary opacity-0 transition-opacity hover:bg-theme-hover hover:text-theme-text-primary focus:opacity-100 group-hover:opacity-100"
            title="Copy as YAML"
            onClick={() => void navigator.clipboard.writeText(yaml)}
          >
            <Copy className="h-3 w-3" />
          </button>
          <pre className="overflow-auto whitespace-pre-wrap break-all p-2 pr-7 font-mono text-[calc(10px*var(--font-scale))] leading-[1.5] text-theme-text-secondary">
            {yaml}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
