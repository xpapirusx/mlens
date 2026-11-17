import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import Editor, { loader, type Monaco } from "@monaco-editor/react";
import type { IRange } from "monaco-editor/editor/editor.api";
import { ChevronDown, ChevronUp, Replace, Search, X } from "lucide-react";
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

export interface YamlEditorHandle {
  /** Opens the find bar (with the replace row hidden). */
  openFind: () => void;
  /** Opens the find bar with the replace row visible. */
  openReplace: () => void;
}

type EditorInstance = Parameters<NonNullable<React.ComponentProps<typeof Editor>["onMount"]>>[0];

const MAX_MATCHES = 500;

/**
 * Standalone Monaco (editor.api) ships without the find contribution, so the
 * find/replace UI is built here on top of `model.findMatches` / `executeEdits`.
 * That also keeps it working in read-only mode.
 */
export const YamlEditor = forwardRef<YamlEditorHandle, YamlEditorProps>(function YamlEditor(
  { value, onChange, readOnly = true, height = "100%", className },
  ref,
) {
  const root = typeof document !== "undefined" ? document.documentElement : null;
  const isDark = Boolean(root?.classList.contains("dark"));
  const editorTheme = root?.classList.contains("theme-dracula")
    ? "mlens-dracula"
    : root?.classList.contains("theme-freelens")
      ? "mlens-freelens"
      : isDark
        ? "mlens-dark"
        : "mlens-light";
  const editorRef = useRef<EditorInstance | null>(null);
  const decorationIds = useRef<string[]>([]);

  const [findOpen, setFindOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [matchIndex, setMatchIndex] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    openFind: () => {
      setReplaceOpen(false);
      setFindOpen(true);
      window.setTimeout(() => searchRef.current?.select(), 30);
    },
    openReplace: () => {
      setReplaceOpen(true);
      setFindOpen(true);
      window.setTimeout(() => searchRef.current?.select(), 30);
    },
  }));

  useEffect(() => {
    // Re-layout when the container becomes visible (dock/drawer transitions).
    const timer = window.setTimeout(() => editorRef.current?.layout(), 80);
    return () => window.clearTimeout(timer);
  }, [value]);

  const findMatches = (needle: string): Array<{ range: IRange }> => {
    const model = editorRef.current?.getModel();
    if (!model || !needle) return [];
    try {
      return model.findMatches(needle, false, false, matchCase, null, false, MAX_MATCHES);
    } catch {
      return [];
    }
  };

  // Recompute matches whenever the query, case flag or document changes.
  useEffect(() => {
    if (!findOpen) return;
    const editor = editorRef.current;
    if (!editor) return;
    const matches = findMatches(query);
    setMatchCount(matches.length);
    setMatchIndex((current) => (matches.length === 0 ? 0 : Math.min(current, matches.length - 1)));
    decorationIds.current = editor.deltaDecorations(
      decorationIds.current,
      query
        ? matches.map((match) => ({
            range: match.range,
            options: { inlineClassName: "yaml-find-match" },
          }))
        : [],
    );
    // `value` is intentionally tracked: edits re-run this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findOpen, query, matchCase, value]);

  useEffect(() => {
    if (findOpen) window.setTimeout(() => searchRef.current?.focus(), 30);
  }, [findOpen]);

  const goToMatch = (delta: number) => {
    const editor = editorRef.current;
    if (!editor) return;
    const matches = findMatches(query);
    if (matches.length === 0) return;
    const next = (matchIndex + delta + matches.length) % matches.length;
    setMatchIndex(next);
    setMatchCount(matches.length);
    editor.setSelection(matches[next].range);
    editor.revealRangeInCenter(matches[next].range);
    editor.focus();
  };

  const replaceCurrent = () => {
    const editor = editorRef.current;
    if (!editor || readOnly) return;
    const matches = findMatches(query);
    if (matches.length === 0) return;
    const target = matches[Math.min(matchIndex, matches.length - 1)];
    editor.executeEdits("mlens-replace", [{ range: target.range, text: replacement }]);
    editor.focus();
  };

  const replaceAll = () => {
    const editor = editorRef.current;
    if (!editor || readOnly) return;
    const matches = findMatches(query);
    if (matches.length === 0) return;
    editor.executeEdits(
      "mlens-replace-all",
      matches.map((match) => ({ range: match.range, text: replacement })),
    );
    editor.focus();
  };

  const closeFind = () => {
    setFindOpen(false);
    setQuery("");
    const editor = editorRef.current;
    if (editor) {
      decorationIds.current = editor.deltaDecorations(decorationIds.current, []);
      editor.focus();
    }
  };

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      goToMatch(event.shiftKey ? -1 : 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeFind();
    }
  };

  return (
    <div className={cn("relative min-h-0 overflow-hidden", className)} style={{ height }}>
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

      {findOpen ? (
        <div className="absolute right-3 top-2 z-10 w-[340px] rounded-lg border border-theme-border bg-theme-elevated shadow-theme-md">
          <div className="flex items-center gap-1 px-2 pt-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-theme-text-tertiary" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setMatchIndex(0);
              }}
              onKeyDown={onSearchKeyDown}
              placeholder="Find"
              spellCheck={false}
              className="h-7 min-w-0 flex-1 rounded border border-theme-border bg-theme-base px-2 font-mono text-[11px] text-theme-text-primary outline-none focus:border-skyhook-500"
            />
            <span className="w-14 shrink-0 text-center font-mono text-[10px] text-theme-text-disabled">
              {query ? (matchCount ? `${matchIndex + 1}/${matchCount}` : "0/0") : ""}
            </span>
            <button
              type="button"
              title="Match case"
              onClick={() => setMatchCase((current) => !current)}
              className={cn(
                "shrink-0 rounded px-1 py-0.5 font-mono text-[10px]",
                matchCase ? "bg-skyhook-500/20 text-accent-text" : "text-theme-text-tertiary hover:text-theme-text-primary",
              )}
            >
              Aa
            </button>
            <button
              type="button"
              title="Previous match"
              disabled={!matchCount}
              onClick={() => goToMatch(-1)}
              className="shrink-0 rounded p-0.5 text-theme-text-tertiary hover:text-theme-text-primary disabled:opacity-40"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Next match"
              disabled={!matchCount}
              onClick={() => goToMatch(1)}
              className="shrink-0 rounded p-0.5 text-theme-text-tertiary hover:text-theme-text-primary disabled:opacity-40"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title={replaceOpen ? "Hide replace" : "Show replace"}
              onClick={() => setReplaceOpen((current) => !current)}
              className="shrink-0 rounded p-0.5 text-theme-text-tertiary hover:text-theme-text-primary"
            >
              <Replace className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Close find"
              onClick={closeFind}
              className="shrink-0 rounded p-0.5 text-theme-text-tertiary hover:text-theme-text-primary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {replaceOpen ? (
            <div className="flex items-center gap-1 px-2 pb-2 pt-1.5">
              <input
                value={replacement}
                onChange={(event) => setReplacement(event.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder="Replace"
                spellCheck={false}
                disabled={readOnly}
                className="h-7 min-w-0 flex-1 rounded border border-theme-border bg-theme-base px-2 font-mono text-[11px] text-theme-text-primary outline-none focus:border-skyhook-500 disabled:opacity-60"
              />
              <button
                type="button"
                title={readOnly ? "Switch to Edit to replace" : "Replace current match"}
                disabled={readOnly || !matchCount}
                onClick={replaceCurrent}
                className="shrink-0 rounded border border-theme-border px-1.5 py-1 text-[10px] text-theme-text-secondary hover:bg-theme-hover disabled:opacity-40"
              >
                Replace
              </button>
              <button
                type="button"
                title={readOnly ? "Switch to Edit to replace" : "Replace all matches"}
                disabled={readOnly || !matchCount}
                onClick={replaceAll}
                className="shrink-0 rounded border border-theme-border px-1.5 py-1 text-[10px] text-theme-text-secondary hover:bg-theme-hover disabled:opacity-40"
              >
                All
              </button>
            </div>
          ) : (
            <div className="h-2" />
          )}
        </div>
      ) : null}
    </div>
  );
});
