import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { Regex, Search, X } from "lucide-react";
import { cn } from "../../lib/cn";

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "size"> {
  value: string;
  onChange: (value: string) => void;
  regex?: boolean;
  onRegexChange?: (regex: boolean) => void;
  regexError?: boolean;
  shortcut?: string;
  trailing?: ReactNode;
  size?: "sm" | "md";
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { value, onChange, regex, onRegexChange, regexError, shortcut = "/", trailing, className, size = "md", ...props },
  ref,
) {
  return (
    <div className={cn("relative w-full", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-theme-text-tertiary" />
      <input
        {...props}
        ref={ref}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        className={cn(
          "w-full rounded-lg border bg-theme-elevated pl-8 text-theme-text-primary placeholder:text-theme-text-tertiary focus:outline-none focus:ring-2 focus:ring-skyhook-500/60",
          size === "md" ? "h-8 pr-16 text-[13px]" : "h-7 pr-14 text-xs",
          regexError ? "border-red-500/60 ring-1 ring-red-500/30" : "border-theme-border",
        )}
      />
      <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {trailing}
        {onRegexChange ? (
          <button
            type="button"
            title={regex ? "Regex search enabled" : "Enable regex search"}
            onClick={() => onRegexChange(!regex)}
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded transition-colors",
              regex
                ? "bg-skyhook-500/20 text-accent-text"
                : "text-theme-text-tertiary hover:bg-theme-hover hover:text-theme-text-primary",
            )}
          >
            <Regex className="h-3.5 w-3.5" />
          </button>
        ) : null}
        {value ? (
          <button
            type="button"
            title="Clear"
            onClick={() => onChange("")}
            className="flex h-5 w-5 items-center justify-center rounded text-theme-text-tertiary hover:bg-theme-hover hover:text-theme-text-primary"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : shortcut ? (
          <span className="kbd">{shortcut}</span>
        ) : null}
      </div>
    </div>
  );
});
