import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
  compact,
}: {
  tabs: Array<{ id: T; label: ReactNode; icon?: ReactNode; badge?: ReactNode; disabled?: boolean; title?: string }>;
  value: T;
  onChange: (id: T) => void;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div role="tablist" className={cn("flex min-w-0 items-center gap-0.5 overflow-x-auto", className)}>
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            title={tab.title}
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 font-medium transition-colors",
              compact ? "px-2 py-1.5 text-[calc(11px*var(--font-scale))]" : "px-2.5 py-2 text-[calc(13px*var(--font-scale))]",
              active
                ? "border-skyhook-500 text-theme-text-primary"
                : "border-transparent text-theme-text-secondary hover:text-theme-text-primary",
              tab.disabled && "cursor-default opacity-40",
            )}
          >
            {tab.icon ? <span className="flex h-3.5 w-3.5 items-center justify-center [&>svg]:h-3.5 [&>svg]:w-3.5">{tab.icon}</span> : null}
            {tab.label}
            {tab.badge}
          </button>
        );
      })}
    </div>
  );
}
