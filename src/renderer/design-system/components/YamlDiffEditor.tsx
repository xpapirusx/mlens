import { DiffEditor, loader } from "@monaco-editor/react";
import { editorThemeName, monaco } from "../../lib/monaco";
import { cn } from "../../lib/cn";
import { useCatalogStore } from "../../stores/catalog-store";

loader.config({ monaco });

/**
 * Read-only side-by-side YAML diff on stock Monaco — the same editor, theme
 * and font as the YAML tab, so a comparison looks like the rest of mLens.
 * `original` renders on the left, `modified` on the right; the shell decides
 * which resource is which.
 */
export function YamlDiffEditor({
  original,
  modified,
  height = "100%",
  className,
}: {
  original: string;
  modified: string;
  height?: string | number;
  className?: string;
}) {
  // Stable slices only — a derived object in the selector would loop React (#185).
  const fontScale = useCatalogStore((state) => state.settings?.fontScale);
  const editorFontFamily = useCatalogStore((state) => state.settings?.editorFontFamily);
  const editorFontSize = useCatalogStore((state) => state.settings?.editorFontSize);
  const editorLineNumbers = useCatalogStore((state) => state.settings?.editorLineNumbers);
  const editorMinimap = useCatalogStore((state) => state.settings?.editorMinimap);
  const editorTabSize = useCatalogStore((state) => state.settings?.editorTabSize);
  const fontSize = Math.max(6, Math.round((editorFontSize ?? 12) * (fontScale ?? 1)));
  const fontFamily = `"${editorFontFamily ?? "DM Mono"}", ui-monospace, SFMono-Regular, Menlo, monospace`;

  return (
    <div className={cn("relative min-h-0 overflow-hidden", className)} style={{ height }}>
      <DiffEditor
        height="100%"
        language="yaml"
        original={original}
        modified={modified}
        theme={editorThemeName()}
        keepCurrentOriginalModel
        keepCurrentModifiedModel
        onMount={(editor) => {
          editor.getOriginalEditor().updateOptions({ tabSize: editorTabSize ?? 2 });
          editor.getModifiedEditor().updateOptions({ tabSize: editorTabSize ?? 2 });
          // Two long YAML documents look identical at the top; jump once to
          // the first change so the coloured diff is actually in view. Monaco
          // computes the diff asynchronously, so poll briefly. Never subscribe
          // to onDidUpdateDiff here: revealFirstDiff() can retrigger layout and
          // loop, leaving the editor blank.
          let timer: number | undefined;
          let attempts = 0;
          const stop = () => {
            if (timer !== undefined) window.clearInterval(timer);
            timer = undefined;
          };
          const schedule = () => {
            stop();
            attempts = 0;
            timer = window.setInterval(() => {
              attempts += 1;
              const changes = editor.getLineChanges();
              if (changes && changes.length > 0) {
                editor.revealFirstDiff();
                stop();
                return;
              }
              if (attempts >= 100) stop();
            }, 100);
          };
          schedule();
          const modelSub = editor.onDidChangeModel(schedule);
          editor.onDidDispose(() => {
            stop();
            modelSub.dispose();
          });
        }}
        options={{
          readOnly: true,
          originalEditable: false,
          renderSideBySide: true,
          useInlineViewWhenSpaceIsLimited: true,
          ignoreTrimWhitespace: true,
          diffAlgorithm: "advanced",
          minimap: { enabled: Boolean(editorMinimap) },
          fontSize,
          lineHeight: fontSize * 1.5,
          fontFamily,
          lineNumbers: editorLineNumbers === false ? "off" : "on",
          scrollBeyondLastLine: false,
          wordWrap: "on",
          folding: true,
          renderLineHighlight: "line",
          scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
          padding: { top: 8, bottom: 8 },
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          renderOverviewRuler: false,
          automaticLayout: true,
          contextmenu: true,
          stickyScroll: { enabled: false },
          enableSplitViewResizing: true,
        }}
      />
    </div>
  );
}
