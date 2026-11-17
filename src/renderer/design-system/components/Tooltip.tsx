import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  delay?: number;
  className?: string;
  wrapperClassName?: string;
}

export function Tooltip({ content, children, side = "bottom", delay = 260, className, wrapperClassName }: TooltipProps) {
  const anchor = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [position, setPosition] = useState<{ x: number; y: number; transform: string } | null>(null);

  const clear = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
  }, []);

  const show = useCallback(() => {
    clear();
    timer.current = window.setTimeout(() => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      let x: number;
      let y: number;
      let transform: string;
      switch (side) {
        case "left":
          x = rect.left - 6;
          y = rect.top + rect.height / 2;
          transform = "translate(-100%, -50%)";
          break;
        case "right":
          x = rect.right + 6;
          y = rect.top + rect.height / 2;
          transform = "translate(0, -50%)";
          break;
        case "top":
          x = Math.min(Math.max(8, rect.left + rect.width / 2), window.innerWidth - 8);
          y = rect.top - 6;
          transform = "translate(-50%, -100%)";
          break;
        default:
          x = Math.min(Math.max(8, rect.left + rect.width / 2), window.innerWidth - 8);
          y = rect.bottom + 6;
          transform = "translateX(-50%)";
      }
      setPosition({ x, y, transform });
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
              transform: position.transform,
            }}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
