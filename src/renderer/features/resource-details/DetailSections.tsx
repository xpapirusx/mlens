import type { ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/cn";
import { CollapseSection } from "../../design-system/components/Collapse";
import { conditionTone, toneClass, toneTextClass } from "../../lib/status";
import { formatRelativeTime } from "../../lib/format";

export function PropertyList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("space-y-1.5", className)}>{children}</div>;
}

export function Property({
  label,
  value,
  copyable,
  mono,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  copyable?: boolean;
  mono?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const display = value === undefined || value === null || value === "" ? "–" : value;

  return (
    <div className={cn("flex items-start gap-2 text-[13px]", className)}>
      <span className="w-40 shrink-0 text-theme-text-tertiary">{label}</span>
      <span
        className={cn(
          "min-w-0 flex-1 break-words",
          mono ? "font-mono text-xs" : "",
          "text-theme-text-primary",
        )}
      >
        {display}
      </span>
      {copyable && typeof display === "string" ? (
        <button
          type="button"
          className="shrink-0 rounded p-0.5 text-theme-text-tertiary hover:bg-theme-hover hover:text-theme-text-primary"
          title="Copy value"
          onClick={() => {
            void navigator.clipboard.writeText(display);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
        </button>
      ) : null}
    </div>
  );
}

export function DetailSection({
  title,
  icon,
  children,
  defaultOpen = true,
  actions,
  count,
}: {
  title: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  actions?: ReactNode;
  count?: number;
}) {
  return (
    <CollapseSection
      title={
        <>
          {title}
          {count !== undefined ? (
            <span className="ml-1.5 rounded bg-theme-elevated px-1 py-px font-mono text-[10px] text-theme-text-tertiary">
              {count}
            </span>
          ) : null}
        </>
      }
      icon={icon}
      defaultOpen={defaultOpen}
      actions={actions}
    >
      {children}
    </CollapseSection>
  );
}

export function ConditionsList({ conditions }: { conditions: Array<Record<string, any>> }) {
  if (!conditions?.length) {
    return <div className="text-xs text-theme-text-tertiary">No conditions reported.</div>;
  }

  const sorted = [...conditions].sort((a, b) => {
    const left = new Date(a.lastTransitionTime ?? 0).getTime();
    const right = new Date(b.lastTransitionTime ?? 0).getTime();
    return right - left;
  });

  return (
    <div className="relative space-y-2.5">
      <div className="absolute bottom-1 left-[52px] top-1 w-px bg-theme-border" aria-hidden />
      {sorted.map((condition, index) => {
        const positive = condition.status === "True";
        const negativeType = /failure|degraded|unhealthy|error|warning/i.test(condition.type ?? "");
        const healthy = negativeType ? !positive : positive;
        const tone = condition.status === "True" ? (negativeType ? "error" : "success") : positive ? "warning" : "neutral";
        return (
          <div key={`${condition.type}-${index}`} className="flex items-start gap-2">
            <span className="w-12 shrink-0 pt-0.5 text-right text-[10px] text-theme-text-disabled">
              {condition.lastTransitionTime ? formatRelativeTime(condition.lastTransitionTime) : "—"}
            </span>
            <span
              className={cn(
                "relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-theme-surface",
                healthy ? "bg-emerald-500" : tone === "error" ? "bg-red-500" : "bg-amber-500",
              )}
            />
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[13px] font-medium text-theme-text-primary">{condition.type}</span>
                <span className={cn("badge-sm", toneClass(conditionTone(condition.status)))}>
                  {condition.status ?? "Unknown"}
                </span>
                {condition.reason ? (
                  <span className={cn("text-[10px]", toneTextClass(tone as never))}>{condition.reason}</span>
                ) : null}
              </div>
              {condition.message ? (
                <div className="mt-0.5 break-words text-[11px] leading-relaxed text-theme-text-tertiary">
                  {condition.message}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function NestedObject({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || value === undefined) return <span className="text-theme-text-tertiary">null</span>;
  if (typeof value === "string") return <span className="break-words">{value}</span>;
  if (typeof value === "number" || typeof value === "boolean") return <span>{String(value)}</span>;

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-theme-text-tertiary">[]</span>;
    if (value.every((entry) => typeof entry !== "object" || entry === null)) {
      return <span className="break-words">{value.map((entry) => String(entry)).join(", ")}</span>;
    }
    return (
      <div className="space-y-1.5">
        {value.map((entry, index) => (
          <div key={index} className={cn(depth < 2 && "card-inner")}>
            <NestedObject value={entry} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return <span className="text-theme-text-tertiary">{"{}"}</span>;

  return (
    <div className={cn("space-y-1", depth > 0 && "border-l border-theme-border pl-2")}>
      {entries.map(([key, entry]) => (
        <div key={key} className="flex items-start gap-2 text-[12px]">
          <span className="w-36 shrink-0 truncate font-mono text-[11px] text-theme-text-tertiary" title={key}>
            {key}
          </span>
          <div className="min-w-0 flex-1 text-theme-text-primary">
            {typeof entry === "object" && entry !== null ? (
              <NestedObject value={entry} depth={depth + 1} />
            ) : (
              <span className="break-words">{String(entry)}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function KeyValueList({
  data,
  secret,
}: {
  data: Record<string, string>;
  secret?: boolean;
}) {
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const entries = Object.entries(data ?? {});

  if (entries.length === 0) {
    return <div className="text-xs text-theme-text-tertiary">No data.</div>;
  }

  return (
    <div className="space-y-1">
      {entries.map(([key, value]) => {
        const decoded = secret ? safeBase64(value) : value;
        const shown = !secret || revealed.has(key);
        return (
          <div key={key} className="flex items-start gap-2 rounded-md border border-theme-border-subtle bg-theme-base px-2 py-1.5">
            <span className="w-44 shrink-0 truncate font-mono text-[11px] text-theme-text-tertiary" title={key}>
              {key}
            </span>
            <pre className="min-w-0 flex-1 overflow-hidden whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-theme-text-primary">
              {shown ? decoded : "••••••••••••"}
            </pre>
            {secret ? (
              <button
                type="button"
                className="shrink-0 rounded px-1 py-0.5 text-[10px] text-theme-text-tertiary hover:bg-theme-hover hover:text-theme-text-primary"
                onClick={() =>
                  setRevealed((current) => {
                    const next = new Set(current);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  })
                }
              >
                {shown ? "Hide" : "Reveal"}
              </button>
            ) : null}
            <button
              type="button"
              title="Copy value"
              className="shrink-0 rounded p-0.5 text-theme-text-tertiary hover:bg-theme-hover hover:text-theme-text-primary"
              onClick={() => void navigator.clipboard.writeText(shown ? decoded : value)}
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function safeBase64(value: string): string {
  try {
    return atob(value);
  } catch {
    return value;
  }
}
