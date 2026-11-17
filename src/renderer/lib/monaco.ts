import * as monaco from "monaco-editor/editor/editor.api";
import "monaco-editor/languages/definitions/yaml/register.js";
// Monaco's stock find widget: Ctrl/Cmd+F with match case, whole word, regex,
// the n-of-m counter and replace. `editor.api` alone registers none of the
// contributions, so this import is what makes the shortcut work (Radar
// registers the same file).
import "monaco-editor/features/find/register.js";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";

// Monaco runs its language services in a worker. YAML highlighting is token
// based, so the generic editor worker is all mLens needs (no CDN, no LSP).
self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

monaco.editor.defineTheme("mlens-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "type", foreground: "7EACDC" },
    { token: "key", foreground: "8BB5EA" },
    { token: "string", foreground: "86EFAC" },
    { token: "number", foreground: "FCD34D" },
    { token: "comment", foreground: "6A7080", fontStyle: "italic" },
  ],
  colors: {
    "editor.background": "#0F172A",
    "editor.foreground": "#CBD5E1",
    "editorLineNumber.foreground": "#475569",
    "editorLineNumber.activeForeground": "#94A3B8",
    "editor.selectionBackground": "#3B82F680",
    "editor.lineHighlightBackground": "#1E293B80",
    "editorIndentGuide.background1": "#1E293B",
    "editorGutter.background": "#0F172A",
  },
});

monaco.editor.defineTheme("mlens-dracula", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "type", foreground: "8BE9FD" },
    { token: "key", foreground: "8BE9FD" },
    { token: "string", foreground: "F1FA8C" },
    { token: "number", foreground: "BD93F9" },
    { token: "comment", foreground: "6272A4", fontStyle: "italic" },
  ],
  colors: {
    "editor.background": "#282A36",
    "editor.foreground": "#F8F8F2",
    "editorLineNumber.foreground": "#6272A4",
    "editorLineNumber.activeForeground": "#F8F8F2",
    "editor.selectionBackground": "#44475A",
    "editor.lineHighlightBackground": "#44475A55",
    "editorIndentGuide.background1": "#44475A",
    "editorGutter.background": "#282A36",
  },
});

monaco.editor.defineTheme("mlens-freelens", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "type", foreground: "4DD6CF" },
    { token: "key", foreground: "4DD6CF" },
    { token: "string", foreground: "9CDCFE" },
    { token: "number", foreground: "B5CEA8" },
    { token: "comment", foreground: "6A9955", fontStyle: "italic" },
  ],
  colors: {
    "editor.background": "#191919",
    "editor.foreground": "#D4D4D4",
    "editorLineNumber.foreground": "#5A5A5A",
    "editorLineNumber.activeForeground": "#C6C6C6",
    "editor.selectionBackground": "#264F78",
    "editor.lineHighlightBackground": "#D7D7D708",
    "editorIndentGuide.background1": "#2A2A2A",
    "editorGutter.background": "#191919",
  },
});

monaco.editor.defineTheme("mlens-light", {
  base: "vs",
  inherit: true,
  rules: [
    { token: "type", foreground: "3B66A8" },
    { token: "key", foreground: "2D4E82" },
    { token: "string", foreground: "047857" },
    { token: "number", foreground: "B45309" },
    { token: "comment", foreground: "6B7080", fontStyle: "italic" },
  ],
  colors: {
    "editor.background": "#F8FBFE",
    "editor.foreground": "#1A1C20",
    "editorLineNumber.foreground": "#A0A4AC",
    "editorLineNumber.activeForeground": "#555860",
    "editor.selectionBackground": "#4A7CC933",
    "editor.lineHighlightBackground": "#F0F3F9",
    "editorIndentGuide.background1": "#E6ECF5",
    "editorGutter.background": "#F8FBFE",
  },
});

export { monaco };
