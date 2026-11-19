import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";

export interface MenuRenderProps {
  close: () => void;
}

interface MenuProps {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode | ((props: MenuRenderProps) => ReactNode);
  align?: "start" | "end";
  side?: "top" | "bottom";
  width?: number;
  className?: string;
}

export function Menu({ trigger, children, align = "start", side = "bottom", width, className }: MenuProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setPosition(null);
  }, []);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const panelWidth = width ?? 220;
    const left =
      align === "end"
        ? Math.min(window.innerWidth - panelWidth - 8, Math.max(8, rect.right - panelWidth))
        : Math.min(window.innerWidth - panelWidth - 8, Math.max(8, rect.left));
    const estimatedHeight = panelRef.current?.offsetHeight ?? 240;
    const top =
      side === "bottom"
        ? rect.bottom + 4 + estimatedHeight > window.innerHeight - 8
          ? Math.max(8, rect.top - estimatedHeight - 4)
          : rect.bottom + 4
        : Math.max(8, rect.top - estimatedHeight - 4);
    setPosition({ left, top });
  }, [open, align, side, width]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onResize = () => close();
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open, close]);

  return (
    <>
      <span ref={anchorRef} className="inline-flex">
        {trigger({ open, toggle: () => (open ? close() : setOpen(true)) })}
      </span>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            className={cn("menu-surface fixed z-[90] p-1", className)}
            style={{ left: position?.left ?? -9999, top: position?.top ?? -9999, width }}
          >
            {typeof children === "function" ? children({ close }) : children}
          </div>,
          document.body,
        )}
    </>
  );
}

export function MenuItem({
  children,
  onClick,
  icon,
  shortcut,
  danger,
  tone,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  icon?: ReactNode;
  shortcut?: string;
  danger?: boolean;
  /** Destructive (red) or affirmative (green) label, without `danger` shorthand. */
  tone?: "success" | "danger";
  disabled?: boolean;
}) {
  const resolvedTone = tone ?? (danger ? "danger" : undefined);
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      data-danger={resolvedTone === "danger" ? "true" : undefined}
      data-tone={resolvedTone}
      className="menu-item disabled:opacity-40"
      onClick={onClick}
    >
      {icon ? <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span> : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut ? <span className="kbd ml-auto">{shortcut}</span> : null}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-theme-border" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2 py-1 text-[calc(10px*var(--font-scale))] font-medium uppercase tracking-wider text-theme-text-tertiary">{children}</div>;
}
