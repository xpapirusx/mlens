import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex h-full min-h-48 flex-col items-center justify-center px-8 py-12 text-center", className)}>
      {icon ? (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-theme-border bg-theme-surface text-theme-text-tertiary [&>svg]:h-5 [&>svg]:w-5">
          {icon}
        </div>
      ) : null}
      <div className="text-sm font-medium text-theme-text-primary">{title}</div>
      {description ? <div className="mt-1 max-w-md text-xs leading-relaxed text-theme-text-tertiary">{description}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function InlineError({ title, message, action }: { title: string; message?: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm">
      <div className="font-medium text-red-600 dark:text-red-400">{title}</div>
      {message ? <div className="mt-1 whitespace-pre-wrap text-xs text-theme-text-secondary">{message}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
