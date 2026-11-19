import { memo, useEffect, useRef, useState } from "react";
import { editorLayout, useSessionStore } from "../../stores/session-store";
import { cn } from "../../lib/cn";
import { EditorPane } from "./EditorPane";

const DEFAULT_WIDTH = 560;
/** Keep at least this much of the resource table visible while resizing. */
const MIN_TABLE_WIDTH = 240;

/**
 * VS Code-like editor area: a resizable column beside the resource table,
 * starting under the table toolbar (Create / Search / live status). It hosts
 * one to four panes (2×2 grid); each pane keeps its own tabs, active resource
 * and history. The area can be expanded over the table, minimized to the
 * details pill and split right/down.
 */
export const EditorArea = memo(function EditorArea({
  clusterId,
  active,
  expanded,
  onToggleExpanded,
}: {
  clusterId: string;
  active: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const editor = useSessionStore((state) => state.sessions[clusterId]?.editor ?? null);
  const setEditorWidth = useSessionStore((state) => state.setEditorWidth);
  const setEditorSplit = useSessionStore((state) => state.setEditorSplit);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidthState] = useState(editor?.width ?? DEFAULT_WIDTH);
  const widthRef = useRef(width);
  const [resizing, setResizing] = useState(false);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const [columnSplit, setColumnSplitState] = useState(editor?.columnSplit ?? 0.5);
  const [rowSplit, setRowSplitState] = useState(editor?.rowSplit ?? 0.5);
  const columnRef = useRef(columnSplit);
  const rowRef = useRef(rowSplit);
  const [splitDrag, setSplitDrag] = useState<"column" | "row" | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  const applyWidth = (value: number) => {
    // The row is the editor's flex parent; grow until the table keeps a
    // readable strip, and never past the row itself.
    const rowWidth = rootRef.current?.parentElement?.clientWidth ?? window.innerWidth;
    const max = Math.max(420, rowWidth - MIN_TABLE_WIDTH);
    const next = Math.min(Math.max(320, Math.round(value)), max);
    widthRef.current = next;
    setWidthState(next);
  };

  useEffect(() => {
    if (!resizing) return;
    const onMove = (event: PointerEvent) => {
      if (!drag.current) return;
      applyWidth(drag.current.startWidth + (drag.current.startX - event.clientX));
    };
    const onUp = () => {
      setResizing(false);
      drag.current = null;
      setEditorWidth(clusterId, widthRef.current);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [resizing, clusterId, setEditorWidth]);

  useEffect(() => {
    if (!splitDrag) return;
    const onMove = (event: PointerEvent) => {
      const rect = gridRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (splitDrag === "column") {
        const next = Math.min(0.8, Math.max(0.2, (event.clientX - rect.left) / rect.width));
        columnRef.current = next;
        setColumnSplitState(next);
      } else {
        const next = Math.min(0.8, Math.max(0.2, (event.clientY - rect.top) / rect.height));
        rowRef.current = next;
        setRowSplitState(next);
      }
    };
    const onUp = () => {
      setSplitDrag(null);
      setEditorSplit(clusterId, { columnSplit: columnRef.current, rowSplit: rowRef.current });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [splitDrag, clusterId, setEditorSplit]);

  if (!editor) return null;
  const panes = editor.panes.filter((pane) => pane.tabs.length > 0);
  if (editor.minimized || panes.length === 0) return null;

  const layout = editorLayout(panes);

  return (
    <div
      ref={rootRef}
      className={cn(
        "flex min-h-0 shrink-0 flex-col border-l border-theme-border bg-theme-surface shadow-drawer",
        expanded ? "absolute inset-y-0 right-0 z-30" : "relative",
        resizing && "select-none",
      )}
      style={{ width: expanded ? "100%" : width }}
      aria-label="Resource editor"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        title="Resize the editor area"
        className={cn(
          "absolute inset-y-0 left-0 z-30 w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-skyhook-500/50",
          resizing && "bg-skyhook-500/50",
          expanded && "hidden",
        )}
        onPointerDown={(event) => {
          event.preventDefault();
          drag.current = { startX: event.clientX, startWidth: widthRef.current };
          setResizing(true);
        }}
      />
      <div
        ref={gridRef}
        className="relative grid min-h-0 flex-1 gap-px overflow-hidden bg-theme-border"
        style={{
          gridTemplateColumns:
            layout.columns === 2
              ? `minmax(0, ${columnSplit}fr) minmax(0, ${1 - columnSplit}fr)`
              : "minmax(0, 1fr)",
          gridTemplateRows:
            layout.rows === 2
              ? `minmax(0, ${rowSplit}fr) minmax(0, ${1 - rowSplit}fr)`
              : "minmax(0, 1fr)",
        }}
      >
        {panes.map((pane) => (
          <div
            key={pane.id}
            className="flex min-h-0 min-w-0"
            style={{
              gridColumn: (pane.slot % 2) + 1,
              gridRow: Math.floor(pane.slot / 2) + 1,
            }}
          >
            <EditorPane
              clusterId={clusterId}
              pane={pane}
              active={active}
              focused={editor.activePaneId === pane.id && panes.length > 1}
              expanded={expanded}
              onToggleExpanded={onToggleExpanded}
            />
          </div>
        ))}
        {layout.columns === 2 ? (
          <div
            role="separator"
            aria-orientation="vertical"
            className={cn(
              "absolute inset-y-0 z-20 w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-skyhook-500/40",
              splitDrag === "column" && "bg-skyhook-500/40",
            )}
            style={{ left: `${columnSplit * 100}%` }}
            onPointerDown={(event) => {
              event.preventDefault();
              setSplitDrag("column");
            }}
          />
        ) : null}
        {layout.rows === 2 ? (
          <div
            role="separator"
            aria-orientation="horizontal"
            className={cn(
              "absolute inset-x-0 z-20 h-1.5 -translate-y-1/2 cursor-row-resize hover:bg-skyhook-500/40",
              splitDrag === "row" && "bg-skyhook-500/40",
            )}
            style={{ top: `${rowSplit * 100}%` }}
            onPointerDown={(event) => {
              event.preventDefault();
              setSplitDrag("row");
            }}
          />
        ) : null}
      </div>
    </div>
  );
});

