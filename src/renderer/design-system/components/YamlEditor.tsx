import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import Editor, { loader, type Monaco } from "@monaco-editor/react";
import { editorThemeName, monaco } from "../../lib/monaco";
import { cn } from "../../lib/cn";

loader.config({ monaco });

interface YamlEditorProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  height?: string | number;
  className?: string;
  fileName?: string;
}

export interface YamlEditorHandle {
  /** Opens Monaco's find widget (Ctrl+F), replace row hidden. */
  openFind: () => void;
  /** Opens Monaco's find widget with the replace row visible. */
  openReplace: () => void;
}

type EditorInstance = Parameters<NonNullable<React.ComponentProps<typeof Editor>["onMount"]>>[0];

/**
 * YAML editing on stock Monaco. The find contribution is registered in
 * `lib/monaco.ts`, so Ctrl/Cmd+F opens Monaco's own widget — match case,
 * whole word, **regex**, the `n of m` counter, next/previous and replace —
 * exactly as in Radar. Replace stays disabled while the editor is read-only.
 */
export const YamlEditor = forwardRef<YamlEditorHandle, YamlEditorProps>(function YamlEditor(
  { value, onChange, readOnly = true, height = "100%", className },
  ref,
) {
  const editorTheme = editorThemeName();
  const editorRef = useRef<EditorInstance | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  const openFind = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    editor.trigger("mlens", "actions.find", null);
  };

  const openReplace = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    editor.trigger("mlens", "editor.action.startFindReplaceAction", null);
  };

  useImperativeHandle(ref, () => ({ openFind, openReplace }));

  useEffect(() => {
    // Re-layout when the container becomes visible (dock/drawer transitions).
    const timer = window.setTimeout(() => editorRef.current?.layout(), 80);
    return () => window.clearTimeout(timer);
  }, [value]);

  // Ctrl/Cmd+F outside the editor textarea (toolbar buttons, gutter clicks)
  // still opens the widget. Events Monaco already consumed are skipped so the
  // key is never handled twice.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "f") return;
      if (!event.ctrlKey && !event.metaKey) return;
      if (event.altKey || event.shiftKey) return;
      if (event.defaultPrevented) return;
      event.preventDefault();
      openFind();
    };
    host.addEventListener("keydown", onKeyDown);
    return () => host.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={hostRef} className={cn("relative min-h-0 overflow-hidden", className)} style={{ height }}>
      <Editor
        height="100%"
        defaultLanguage="yaml"
        theme={editorTheme}
        value={value}
        onChange={(next) => onChange?.(next ?? "")}
        onMount={(editor) => {
          editorRef.current = editor;
        }}
        beforeMount={(instance: Monaco) => {
          instance.editor.setTheme(editorTheme);
        }}
        options={{
          readOnly,
          domReadOnly: readOnly,
          minimap: { enabled: false },
          fontSize: 12,
          lineHeight: 18,
          fontFamily: "'DM Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
          lineNumbers: "on",
          scrollBeyondLastLine: false,
          wordWrap: "on",
          folding: true,
          renderLineHighlight: "line",
          scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
          padding: { top: 8, bottom: 8 },
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          automaticLayout: true,
          contextmenu: true,
          stickyScroll: { enabled: false },
        }}
      />
    </div>
  );
});
