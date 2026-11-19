import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { toneClass, type Tone } from "../../lib/status";

export function StatusBadge({
  tone,
  children,
  className,
  title,
}: {
  tone: Tone;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  // A quick fade only when the label itself changes (watch updates), not on
  // every unrelated re-render. Non-text children keep the plain node.
  const text =
    typeof children === "string" || typeof children === "number" ? String(children) : null;
  return (
    <span className={cn("badge", toneClass(tone), className)} title={title}>
      {text !== null ? (
        <span key={text} className="status-fade">
          {children}
        </span>
      ) : (
        children
      )}
    </span>
  );
}

export function KindBadge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("badge", "status-unknown", className)}>{children}</span>;
}

export function CountBadge({ children, active }: { children: ReactNode; active?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-6 items-center justify-center rounded px-1 font-mono text-[calc(10px*var(--font-scale))] leading-4 tabular-nums",
        active ? "bg-skyhook-500/30 text-accent-text" : "bg-theme-elevated text-theme-text-tertiary",
      )}
    >
      {children}
    </span>
  );
}
