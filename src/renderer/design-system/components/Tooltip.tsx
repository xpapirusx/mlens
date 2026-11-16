import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  delay?: number;
  className?: string;
  wrapperClassName?: string;
}

export function Tooltip({ content, children, side = "bottom", delay = 260, className, wrapperClassName }: TooltipProps) {
  const anchor = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);

  const clear = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
  }, []);

  const show = useCallback(() => {
    clear();
    timer.current = window.setTimeout(() => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const x = Math.min(Math.max(8, rect.left + rect.width / 2), window.innerWidth - 8);
      setPosition({ x, y: side === "bottom" ? rect.bottom + 6 : rect.top - 6 });
    }, delay);
  }, [clear, delay, side]);

  useEffect(() => () => clear(), [clear]);

  return (
    <>
      <span
        ref={anchor}
        className={cn("inline-flex min-w-0", wrapperClassName)}
        onMouseEnter={show}
        onMouseLeave={() => {
          clear();
          setPosition(null);
        }}
        onMouseDown={() => {
          clear();
          setPosition(null);
        }}
      >
        {children}
      </span>
      {position &&
        createPortal(
          <div
            role="tooltip"
            className={cn(
              "pointer-events-none fixed z-[100] max-w-xs rounded-md border border-theme-border bg-theme-surface px-2 py-1 text-[11px] leading-snug text-theme-text-secondary shadow-theme-md",
              className,
            )}
            style={{
              left: position.x,
              top: position.y,
              transform: side === "bottom" ? "translateX(-50%)" : "translate(-50%, -100%)",
            }}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
