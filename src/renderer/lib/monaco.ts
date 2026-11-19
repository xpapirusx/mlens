import * as monaco from "monaco-editor/editor/editor.api";
import "monaco-editor/languages/definitions/yaml/register.js";
// Monaco's stock find widget: Ctrl/Cmd+F with match case, whole word, regex,
// the n-of-m counter and replace. `editor.api` alone registers none of the
// contributions, so this import is what makes the shortcut work (Radar
// registers the same file).
import "monaco-editor/features/find/register.js";
// Indentation folding: the gutter fold controls and Ctrl+Shift+[ / ] folding
// of YAML blocks. Without this contribution `folding: true` does nothing.
import "monaco-editor/editor/contrib/folding/browser/folding.js";
// The find widget draws its chevrons and arrows with codicon glyphs; the font
// only exists once this stylesheet is bundled (editor.api never pulls it in).
// The `features/*` entry point is the one the package exports map resolves —
// the raw `base/...` CSS path does not.
import "monaco-editor/features/codicon/register.js";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";

// Monaco runs its language services in a worker. YAML highlighting is token
// based, so the generic editor worker is all mLens needs (no CDN, no LSP).
self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

// Monaco's stock diff colours are deliberately faint. Use stronger, semantic
// green/red so changed lines are obvious in every mLens theme.
const DIFF_COLORS = {
  "diffEditor.insertedTextBackground": "#22c55e33",
  "diffEditor.removedTextBackground": "#ef444433",
  "diffEditor.insertedLineBackground": "#22c55e26",
  "diffEditor.removedLineBackground": "#ef444426",
  "diffEditorGutter.insertedLineBackground": "#22c55e33",
  "diffEditorGutter.removedLineBackground": "#ef444433",
  "diffEditorOverview.insertedForeground": "#22c55eaa",
  "diffEditorOverview.removedForeground": "#ef4444aa",
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
    ...DIFF_COLORS,
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
    ...DIFF_COLORS,
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
    ...DIFF_COLORS,
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
    ...DIFF_COLORS,
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

monaco.editor.defineTheme("mlens-proton", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "type", foreground: "5E9EFF" },
    { token: "key", foreground: "7DB2FF" },
    { token: "string", foreground: "6BCF7F" },
    { token: "number", foreground: "FFD93D" },
    { token: "comment", foreground: "9299A8", fontStyle: "italic" },
  ],
  colors: {
    ...DIFF_COLORS,
    "editor.background": "#0F1419",
    "editor.foreground": "#F5F7FA",
    "editorLineNumber.foreground": "#4A5160",
    "editorLineNumber.activeForeground": "#9299A8",
    "editor.selectionBackground": "#5E9EFF59",
    "editor.lineHighlightBackground": "#1A1F2E80",
    "editorIndentGuide.background1": "#23293D",
    "editorGutter.background": "#0F1419",
    // Stock find widget: keep its chrome on the Proton surfaces.
    "editorWidget.background": "#161C26",
    "editorWidget.border": "rgba(255,255,255,0.14)",
    "input.background": "#0F1419",
    "input.border": "rgba(255,255,255,0.14)",
    "findMatchHighlightBackground": "#FFD93D59",
    "findMatchHighlightBorder": "#FFD93D",
    "editor.findMatchHighlightBackground": "#FFD93D59",
  },
});

monaco.editor.defineTheme("mlens-synthwave", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "type", foreground: "36F9F6" },
    { token: "key", foreground: "FF7EDB" },
    { token: "string", foreground: "FF8B39" },
    { token: "number", foreground: "F97E72" },
    { token: "comment", foreground: "848BBD", fontStyle: "italic" },
  ],
  colors: {
    ...DIFF_COLORS,
    "editor.background": "#262335",
    "editor.foreground": "#F8F8F2",
    "editorLineNumber.foreground": "#5A5470",
    "editorLineNumber.activeForeground": "#B6B1C2",
    "editor.selectionBackground": "#FF7EDB40",
    "editor.lineHighlightBackground": "#34294F80",
    "editorIndentGuide.background1": "#34294F",
    "editorGutter.background": "#262335",
  },
});

monaco.editor.defineTheme("mlens-islands", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "type", foreground: "2AACB8" },
    { token: "key", foreground: "7CACF8" },
    { token: "string", foreground: "8CCF15" },
    { token: "number", foreground: "E8A33E" },
    { token: "comment", foreground: "6F737A", fontStyle: "italic" },
  ],
  colors: {
    ...DIFF_COLORS,
    "editor.background": "#181A1D",
    "editor.foreground": "#BCBEC4",
    "editorLineNumber.foreground": "#4E5157",
    "editorLineNumber.activeForeground": "#8F9298",
    "editor.selectionBackground": "#548AF740",
    "editor.lineHighlightBackground": "#25262A80",
    "editorIndentGuide.background1": "#303237",
    "editorGutter.background": "#181A1D",
  },
});

monaco.editor.defineTheme("mlens-github", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "type", foreground: "FFA657" },
    { token: "key", foreground: "79C0FF" },
    { token: "string", foreground: "A5D6FF" },
    { token: "number", foreground: "79C0FF" },
    { token: "comment", foreground: "8B949E", fontStyle: "italic" },
  ],
  colors: {
    ...DIFF_COLORS,
    "editor.background": "#0D1117",
    "editor.foreground": "#C9D1D9",
    "editorLineNumber.foreground": "#484F58",
    "editorLineNumber.activeForeground": "#8B949E",
    "editor.selectionBackground": "#388BFD40",
    "editor.lineHighlightBackground": "#161B2280",
    "editorIndentGuide.background1": "#21262D",
    "editorGutter.background": "#0D1117",
    "editorWidget.background": "#161B22",
    "editorWidget.border": "#30363D",
    "input.background": "#0D1117",
    "input.border": "#30363D",
  },
});

monaco.editor.defineTheme("mlens-night-owl", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "type", foreground: "C792EA" },
    { token: "key", foreground: "82AAFF" },
    { token: "string", foreground: "ECC48D" },
    { token: "number", foreground: "F78C6C" },
    { token: "comment", foreground: "637777", fontStyle: "italic" },
  ],
  colors: {
    ...DIFF_COLORS,
    "editor.background": "#011627",
    "editor.foreground": "#D6DEEB",
    "editorLineNumber.foreground": "#4B6479",
    "editorLineNumber.activeForeground": "#89A4BB",
    "editor.selectionBackground": "#234D708C",
    "editor.lineHighlightBackground": "#0B294280",
    "editorIndentGuide.background1": "#1D3B53",
    "editorGutter.background": "#011627",
  },
});

monaco.editor.defineTheme("mlens-material", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "type", foreground: "CE93D8" },
    { token: "key", foreground: "81D4FA" },
    { token: "string", foreground: "A5D6A7" },
    { token: "number", foreground: "FFB74D" },
    { token: "comment", foreground: "8B929C", fontStyle: "italic" },
  ],
  colors: {
    ...DIFF_COLORS,
    "editor.background": "#1B1E23",
    "editor.foreground": "#E3E6EA",
    "editorLineNumber.foreground": "#666D78",
    "editorLineNumber.activeForeground": "#8B929C",
    "editor.selectionBackground": "#4FC3F740",
    "editor.lineHighlightBackground": "#2A2F3680",
    "editorIndentGuide.background1": "#333941",
    "editorGutter.background": "#1B1E23",
  },
});

monaco.editor.defineTheme("mlens-one-dark-pro", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "type", foreground: "E5C07B" },
    { token: "key", foreground: "61AFEF" },
    { token: "string", foreground: "98C379" },
    { token: "number", foreground: "D19A66" },
    { token: "comment", foreground: "5C6370", fontStyle: "italic" },
  ],
  colors: {
    ...DIFF_COLORS,
    "editor.background": "#23272E",
    "editor.foreground": "#ABB2BF",
    "editorLineNumber.foreground": "#4B5263",
    "editorLineNumber.activeForeground": "#9DA5B4",
    "editor.selectionBackground": "#61AFEF40",
    "editor.lineHighlightBackground": "#2C313A80",
    "editorIndentGuide.background1": "#3E4451",
    "editorGutter.background": "#23272E",
  },
});

monaco.editor.defineTheme("mlens-one-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "type", foreground: "E5C07B" },
    { token: "key", foreground: "61AFEF" },
    { token: "string", foreground: "98C379" },
    { token: "number", foreground: "D19A66" },
    { token: "comment", foreground: "5C6370", fontStyle: "italic" },
  ],
  colors: {
    ...DIFF_COLORS,
    "editor.background": "#282C34",
    "editor.foreground": "#ABB2BF",
    "editorLineNumber.foreground": "#4B5263",
    "editorLineNumber.activeForeground": "#9DA5B4",
    "editor.selectionBackground": "#61AFEF40",
    "editor.lineHighlightBackground": "#2C313A80",
    "editorIndentGuide.background1": "#3E4451",
    "editorGutter.background": "#282C34",
  },
});

monaco.editor.defineTheme("mlens-catppuccin", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "type", foreground: "89B4FA" },
    { token: "key", foreground: "CBA6F7" },
    { token: "string", foreground: "A6E3A1" },
    { token: "number", foreground: "FAB387" },
    { token: "comment", foreground: "6C7086", fontStyle: "italic" },
  ],
  colors: {
    ...DIFF_COLORS,
    "editor.background": "#1E1E2E",
    "editor.foreground": "#CDD6F4",
    "editorLineNumber.foreground": "#585B70",
    "editorLineNumber.activeForeground": "#A6ADC8",
    "editor.selectionBackground": "#CBA6F740",
    "editor.lineHighlightBackground": "#31324480",
    "editorIndentGuide.background1": "#313244",
    "editorGutter.background": "#1E1E2E",
  },
});

monaco.editor.defineTheme("mlens-jellybeans", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "type", foreground: "D8AD4C" },
    { token: "key", foreground: "8197BF" },
    { token: "string", foreground: "99AD6A" },
    { token: "number", foreground: "CF6A4C" },
    { token: "comment", foreground: "6C6C5F", fontStyle: "italic" },
  ],
  colors: {
    ...DIFF_COLORS,
    "editor.background": "#151515",
    "editor.foreground": "#E8E8D3",
    "editorLineNumber.foreground": "#4A4A3F",
    "editorLineNumber.activeForeground": "#999988",
    "editor.selectionBackground": "#8197BF40",
    "editor.lineHighlightBackground": "#26262680",
    "editorIndentGuide.background1": "#333333",
    "editorGutter.background": "#151515",
  },
});

monaco.editor.defineTheme("mlens-adwaita", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "type", foreground: "F9F06B" },
    { token: "key", foreground: "78AEED" },
    { token: "string", foreground: "8FF0A4" },
    { token: "number", foreground: "FFA348" },
    { token: "comment", foreground: "77767B", fontStyle: "italic" },
  ],
  colors: {
    ...DIFF_COLORS,
    "editor.background": "#1E1E1E",
    "editor.foreground": "#FFFFFF",
    "editorLineNumber.foreground": "#5E5C64",
    "editorLineNumber.activeForeground": "#9A9996",
    "editor.selectionBackground": "#78AEED40",
    "editor.lineHighlightBackground": "#30303080",
    "editorIndentGuide.background1": "#3D3D3D",
    "editorGutter.background": "#1E1E1E",
  },
});

/**
 * Theme id for the editor matching the shell's html classes. Read at mount
 * time; the shell re-applies the classes on a theme switch and remounts the
 * editors that care.
 */
export function editorThemeName(): string {
  if (typeof document === "undefined") return "mlens-dark";
  const root = document.documentElement;
  if (root.classList.contains("theme-dracula")) return "mlens-dracula";
  if (root.classList.contains("theme-freelens")) return "mlens-freelens";
  if (root.classList.contains("theme-proton")) return "mlens-proton";
  if (root.classList.contains("theme-synthwave")) return "mlens-synthwave";
  if (root.classList.contains("theme-islands")) return "mlens-islands";
  if (root.classList.contains("theme-github")) return "mlens-github";
  if (root.classList.contains("theme-night-owl")) return "mlens-night-owl";
  if (root.classList.contains("theme-material")) return "mlens-material";
  if (root.classList.contains("theme-one-dark-pro")) return "mlens-one-dark-pro";
  if (root.classList.contains("theme-one-dark")) return "mlens-one-dark";
  if (root.classList.contains("theme-catppuccin")) return "mlens-catppuccin";
  if (root.classList.contains("theme-jellybeans")) return "mlens-jellybeans";
  if (root.classList.contains("theme-adwaita")) return "mlens-adwaita";
  return root.classList.contains("dark") ? "mlens-dark" : "mlens-light";
}

export { monaco };
