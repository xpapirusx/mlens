import { LoaderCircle } from "lucide-react";
import { cn } from "../../lib/cn";

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-theme-text-tertiary", className)}>
      <LoaderCircle className="h-4 w-4 animate-spin" />
      {label ? <span className="text-xs">{label}</span> : null}
    </span>
  );
}
