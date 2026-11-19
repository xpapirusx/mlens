import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";
import { Button } from "./Button";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  className?: string;
}

export function Modal({ open, onClose, title, subtitle, children, footer, width = 560, className }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-start justify-center overflow-y-auto bg-black/40 p-8 backdrop-blur-[1px]">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={cn("dialog relative my-12 flex max-h-[calc(100vh-6rem)] w-full flex-col overflow-hidden", className)}
        style={{ maxWidth: width }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-theme-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[calc(15px*var(--font-scale))] font-semibold text-theme-text-primary">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs text-theme-text-tertiary">{subtitle}</p> : null}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close dialog">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-theme-border bg-theme-base/60 px-5 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
