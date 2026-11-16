import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "icon" | "xs";

const VARIANTS: Record<Variant, string> = {
  primary: "btn-brand",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  danger:
    "text-red-600 dark:text-red-400 border border-red-500/30 bg-red-500/10 hover:bg-red-500/15 rounded-lg",
  subtle: "bg-theme-elevated text-theme-text-secondary hover:bg-theme-hover hover:text-theme-text-primary rounded-lg",
};

const SIZES: Record<Size, string> = {
  xs: "h-6 px-2 text-[11px] gap-1",
  sm: "h-7 px-2.5 text-xs gap-1.5",
  md: "h-8 px-3 text-[13px] gap-1.5",
  icon: "h-7 w-7 justify-center",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children?: ReactNode;
}

export function Button({ variant = "secondary", size = "md", className, children, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center whitespace-nowrap font-medium transition-colors disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
