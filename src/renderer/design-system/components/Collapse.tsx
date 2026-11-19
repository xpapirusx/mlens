import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "../../lib/cn";

export function Collapse({
  open,
  children,
  className,
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("collapse-grid", className)} data-open={open}>
      <div>{children}</div>
    </div>
  );
}

export function CollapseSection({
  title,
  icon,
  children,
  defaultOpen = true,
  actions,
  variant = "plain",
}: {
  title: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  actions?: ReactNode;
  variant?: "plain" | "card";
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className={cn(
        variant === "card"
          ? "min-w-0 overflow-hidden rounded-lg border border-theme-border bg-theme-surface"
          : "border-b-subtle pb-4 last:border-0",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2",
          variant === "card" ? "border-b border-theme-border bg-theme-elevated px-3 py-2.5" : "mb-2",
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-theme-text-secondary transition-colors hover:text-theme-text-primary"
        >
          <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-90")} />
          {icon ? <span className="flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:h-4 [&>svg]:w-4">{icon}</span> : null}
          <span
            className={cn(
              "truncate font-medium",
              variant === "card" ? "text-[calc(11px*var(--font-scale))] uppercase tracking-wider" : "text-[calc(13px*var(--font-scale))]",
            )}
          >
            {title}
          </span>
        </button>
        {actions}
      </div>
      <Collapse open={open}>
        <div className={variant === "card" ? "p-3" : "pl-5"}>{children}</div>
      </Collapse>
    </div>
  );
}
