import { useEffect, useRef } from "react";
import Editor, { loader, type Monaco } from "@monaco-editor/react";
import { monaco } from "../../lib/monaco";
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

export function YamlEditor({ value, onChange, readOnly = true, height = "100%", className }: YamlEditorProps) {
  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const editorRef = useRef<Parameters<NonNullable<React.ComponentProps<typeof Editor>["onMount"]>>[0] | null>(null);

  useEffect(() => {
    // Re-layout when the container becomes visible (dock/drawer transitions).
    const timer = window.setTimeout(() => editorRef.current?.layout(), 80);
    return () => window.clearTimeout(timer);
  }, [value]);

  return (
    <div className={cn("min-h-0 overflow-hidden", className)} style={{ height }}>
      <Editor
        height="100%"
        defaultLanguage="yaml"
        theme={isDark ? "mlens-dark" : "mlens-light"}
        value={value}
        onChange={(next) => onChange?.(next ?? "")}
        onMount={(editor) => {
          editorRef.current = editor;
        }}
        beforeMount={(instance: Monaco) => {
          instance.editor.setTheme(isDark ? "mlens-dark" : "mlens-light");
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
}
