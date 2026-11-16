import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";

/** Cursor-anchored context menu, used by resource table rows. */
export function ContextMenu({
  x,
  y,
  open,
  onClose,
  children,
  width = 220,
}: {
  x: number;
  y: number;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useEffect(() => {
    if (!open) return;
    const height = panelRef.current?.offsetHeight ?? 260;
    setPosition({
      left: Math.min(x, window.innerWidth - width - 8),
      top: Math.min(y, window.innerHeight - height - 8),
    });
  }, [open, x, y, width]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      className={cn("menu-surface fixed z-[92] p-1")}
      style={{ left: position.left, top: position.top, width }}
    >
      {children}
    </div>,
    document.body,
  );
}
