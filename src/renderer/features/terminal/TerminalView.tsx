import { useEffect, useMemo, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import type { TerminalTarget } from "../../stores/session-store";
import { useCatalogStore } from "../../stores/catalog-store";
import { api, errorText } from "../../lib/api";
import { cn } from "../../lib/cn";
import { podCommandArgv } from "../../lib/command-line";
import { toast } from "../../design-system/components/Toast";

const RADAR_TERMINAL_THEME = {
  background: "#0b1322",
  foreground: "#e2e8f0",
  cursor: "#60a5fa",
  cursorAccent: "#0f172a",
  selectionBackground: "#3b82f680",
  black: "#1e293b",
  red: "#f87171",
  green: "#4ade80",
  yellow: "#facc15",
  blue: "#60a5fa",
  magenta: "#c084fc",
  cyan: "#22d3ee",
  white: "#f1f5f9",
  brightBlack: "#475569",
  brightRed: "#fca5a5",
  brightGreen: "#86efac",
  brightYellow: "#fde047",
  brightBlue: "#93c5fd",
  brightMagenta: "#d8b4fe",
  brightCyan: "#67e8f9",
  brightWhite: "#f8fafc",
};

const DRACULA_TERMINAL_THEME = {
  background: "#282A36",
  foreground: "#F8F8F2",
  cursor: "#F8F8F2",
  cursorAccent: "#282A36",
  selectionBackground: "#44475A",
  black: "#21222C",
  red: "#FF5555",
  green: "#50FA7B",
  yellow: "#F1FA8C",
  blue: "#BD93F9",
  magenta: "#FF79C6",
  cyan: "#8BE9FD",
  white: "#F8F8F2",
  brightBlack: "#6272A4",
  brightRed: "#FF6E6E",
  brightGreen: "#69FF94",
  brightYellow: "#FFFFA5",
  brightBlue: "#D6ACFF",
  brightMagenta: "#FF92DF",
  brightCyan: "#A4FFFF",
  brightWhite: "#FFFFFF",
};

const FREELENS_TERMINAL_THEME = {
  background: "#000000",
  foreground: "#ffffff",
  cursor: "#ffffff",
  cursorAccent: "#000000",
  selectionBackground: "#264f78",
  black: "#2e3436",
  red: "#cc0000",
  green: "#4e9a06",
  yellow: "#c4a000",
  blue: "#3465a4",
  magenta: "#75507b",
  cyan: "#06989a",
  white: "#d3d7cf",
  brightBlack: "#555753",
  brightRed: "#ef2929",
  brightGreen: "#8ae234",
  brightYellow: "#fce94f",
  brightBlue: "#729fcf",
  brightMagenta: "#ad7fa8",
  brightCyan: "#34e2e2",
  brightWhite: "#eeeeec",
};

/** luci-theme-proton2025 palette: slate #0f1419, accent #5e9eff, its status hues. */
const PROTON_TERMINAL_THEME = {
  background: "#0f1419",
  foreground: "#c5cad5",
  cursor: "#5e9eff",
  cursorAccent: "#0f1419",
  selectionBackground: "#5e9eff59",
  black: "#1a1f2e",
  red: "#ff6b6b",
  green: "#6bcf7f",
  yellow: "#ffd93d",
  blue: "#5e9eff",
  magenta: "#c792ea",
  cyan: "#56d4dd",
  white: "#f5f7fa",
  brightBlack: "#9299a8",
  brightRed: "#ff8787",
  brightGreen: "#8fe39f",
  brightYellow: "#ffe680",
  brightBlue: "#7db2ff",
  brightMagenta: "#d4b5ff",
  brightCyan: "#84e5ee",
  brightWhite: "#ffffff",
};

/** SynthWave '84 ANSI palette (robb0wen/synthwave-vscode, MIT). */
const SYNTHWAVE_TERMINAL_THEME = {
  background: "#241b2f",
  foreground: "#ffffff",
  cursor: "#36f9f6",
  cursorAccent: "#241b2f",
  selectionBackground: "#ff7edb40",
  black: "#1b1526",
  red: "#fe4450",
  green: "#72f1b8",
  yellow: "#f3e70f",
  blue: "#03edf9",
  magenta: "#ff7edb",
  cyan: "#03edf9",
  white: "#ffffff",
  brightBlack: "#848bbd",
  brightRed: "#fe4450",
  brightGreen: "#72f1b8",
  brightYellow: "#fede5d",
  brightBlue: "#03edf9",
  brightMagenta: "#ff7edb",
  brightCyan: "#36f9f6",
  brightWhite: "#ffffff",
};

/** Dark Islands ANSI palette (bwya77/vscode-dark-islands, MIT). */
const ISLANDS_TERMINAL_THEME = {
  background: "#181a1d",
  foreground: "#bcbec4",
  cursor: "#548af7",
  cursorAccent: "#181a1d",
  selectionBackground: "#548af740",
  black: "#202226",
  red: "#f75464",
  green: "#73b00a",
  yellow: "#e8a33e",
  blue: "#548af7",
  magenta: "#c77dbb",
  cyan: "#2aacb8",
  white: "#bcbec4",
  brightBlack: "#6f737a",
  brightRed: "#f9667a",
  brightGreen: "#8ccf15",
  brightYellow: "#f0b95e",
  brightBlue: "#7cacf8",
  brightMagenta: "#d79fd2",
  brightCyan: "#42c6d2",
  brightWhite: "#d4d5d9",
};

/** GitHub dark ANSI palette (primer/github-vscode-theme, MIT). */
const GITHUB_TERMINAL_THEME = {
  background: "#0d1117",
  foreground: "#c9d1d9",
  cursor: "#58a6ff",
  cursorAccent: "#0d1117",
  selectionBackground: "#388bfd40",
  black: "#484f58",
  red: "#ff7b72",
  green: "#3fb950",
  yellow: "#d29922",
  blue: "#58a6ff",
  magenta: "#bc8cff",
  cyan: "#39c5cf",
  white: "#b1bac4",
  brightBlack: "#6e7681",
  brightRed: "#ffa198",
  brightGreen: "#56d364",
  brightYellow: "#e3b341",
  brightBlue: "#79c0ff",
  brightMagenta: "#d2a8ff",
  brightCyan: "#56d4dd",
  brightWhite: "#f0f6fc",
};

/** Night Owl ANSI palette (sdras/night-owl-vscode-theme, MIT). */
const NIGHT_OWL_TERMINAL_THEME = {
  background: "#011627",
  foreground: "#d6deeb",
  cursor: "#82aaff",
  cursorAccent: "#011627",
  selectionBackground: "#234d708c",
  black: "#011627",
  red: "#ef5350",
  green: "#22da6e",
  yellow: "#c5e478",
  blue: "#82aaff",
  magenta: "#c792ea",
  cyan: "#21c7a8",
  white: "#ffffff",
  brightBlack: "#575656",
  brightRed: "#ef5350",
  brightGreen: "#22da6e",
  brightYellow: "#ffeb95",
  brightBlue: "#82aaff",
  brightMagenta: "#c792ea",
  brightCyan: "#7fdbca",
  brightWhite: "#ffffff",
};

/** Material palette inspired by material-icon-theme (Material blue-grey). */
const MATERIAL_TERMINAL_THEME = {
  background: "#1b1e23",
  foreground: "#e3e6ea",
  cursor: "#4fc3f7",
  cursorAccent: "#1b1e23",
  selectionBackground: "#4fc3f740",
  black: "#333941",
  red: "#e57373",
  green: "#81c784",
  yellow: "#ffb74d",
  blue: "#4fc3f7",
  magenta: "#ce93d8",
  cyan: "#4dd0e1",
  white: "#e3e6ea",
  brightBlack: "#666d78",
  brightRed: "#ef9a9a",
  brightGreen: "#a5d6a7",
  brightYellow: "#ffcc80",
  brightBlue: "#81d4fa",
  brightMagenta: "#e1bee7",
  brightCyan: "#80deea",
  brightWhite: "#ffffff",
};

const ONE_DARK_TERMINAL_THEME = {
  background: "#282c34",
  foreground: "#abb2bf",
  cursor: "#61afef",
  cursorAccent: "#282c34",
  selectionBackground: "#61afef40",
  black: "#282c34",
  red: "#e06c75",
  green: "#98c379",
  yellow: "#e5c07b",
  blue: "#61afef",
  magenta: "#c678dd",
  cyan: "#56b6c2",
  white: "#abb2bf",
  brightBlack: "#5c6370",
  brightRed: "#e06c75",
  brightGreen: "#98c379",
  brightYellow: "#e5c07b",
  brightBlue: "#61afef",
  brightMagenta: "#c678dd",
  brightCyan: "#56b6c2",
  brightWhite: "#ffffff",
};

const ONE_DARK_PRO_TERMINAL_THEME = {
  ...ONE_DARK_TERMINAL_THEME,
  background: "#23272e",
  cursorAccent: "#23272e",
};

const CATPPUCCIN_TERMINAL_THEME = {
  background: "#1e1e2e",
  foreground: "#cdd6f4",
  cursor: "#f5e0dc",
  cursorAccent: "#1e1e2e",
  selectionBackground: "#585b70",
  black: "#45475a",
  red: "#f38ba8",
  green: "#a6e3a1",
  yellow: "#f9e2af",
  blue: "#89b4fa",
  magenta: "#f5c2e7",
  cyan: "#94e2d5",
  white: "#bac2de",
  brightBlack: "#585b70",
  brightRed: "#f38ba8",
  brightGreen: "#a6e3a1",
  brightYellow: "#f9e2af",
  brightBlue: "#89b4fa",
  brightMagenta: "#f5c2e7",
  brightCyan: "#94e2d5",
  brightWhite: "#a6adc8",
};

const JELLYBEANS_TERMINAL_THEME = {
  background: "#151515",
  foreground: "#e8e8d3",
  cursor: "#e8e8d3",
  cursorAccent: "#151515",
  selectionBackground: "#8197bf40",
  black: "#1f1f1f",
  red: "#cf6a4c",
  green: "#99ad6a",
  yellow: "#d8ad4c",
  blue: "#8197bf",
  magenta: "#c6b6ee",
  cyan: "#8fbfdc",
  white: "#e8e8d3",
  brightBlack: "#6c6c5f",
  brightRed: "#cf6a4c",
  brightGreen: "#99ad6a",
  brightYellow: "#d8ad4c",
  brightBlue: "#8197bf",
  brightMagenta: "#c6b6ee",
  brightCyan: "#8fbfdc",
  brightWhite: "#ffffff",
};

const ADWAITA_TERMINAL_THEME = {
  background: "#1e1e1e",
  foreground: "#ffffff",
  cursor: "#78aeed",
  cursorAccent: "#1e1e1e",
  selectionBackground: "#78aeed40",
  black: "#3d3d3d",
  red: "#f66151",
  green: "#8ff0a4",
  yellow: "#f9f06b",
  blue: "#78aeed",
  magenta: "#dc8add",
  cyan: "#62a0ea",
  white: "#ffffff",
  brightBlack: "#5e5c64",
  brightRed: "#f66151",
  brightGreen: "#8ff0a4",
  brightYellow: "#f9f06b",
  brightBlue: "#99c1f1",
  brightMagenta: "#dc8add",
  brightCyan: "#93ddff",
  brightWhite: "#ffffff",
};

/** Copilot ANSI palette (benjaminbenais/copilot-theme). */
const COPILOT_TERMINAL_THEME = {
  background: "#232a2f",
  foreground: "#d4dce4",
  cursor: "#89ddff",
  cursorAccent: "#232a2f",
  selectionBackground: "#89ddff40",
  black: "#1a2023",
  red: "#ff6a80",
  green: "#5bec95",
  yellow: "#ffea6b",
  blue: "#89ddff",
  magenta: "#ba8ef7",
  cyan: "#89ddff",
  white: "#d4dce4",
  brightBlack: "#707a84",
  brightRed: "#ff8a9b",
  brightGreen: "#7ff0a8",
  brightYellow: "#fff29b",
  brightBlue: "#a5e8ff",
  brightMagenta: "#cba9ff",
  brightCyan: "#a5e8ff",
  brightWhite: "#ffffff",
};

/** Min ANSI palette (miguelsolorio/min-theme, MIT). */
const MIN_TERMINAL_THEME = {
  background: "#1f1f1f",
  foreground: "#e0e0e0",
  cursor: "#fafafa",
  cursorAccent: "#1f1f1f",
  selectionBackground: "#44475a80",
  black: "#1a1a1a",
  red: "#ff7a84",
  green: "#7ec699",
  yellow: "#ffab70",
  blue: "#79b8ff",
  magenta: "#b392f0",
  cyan: "#56b6c2",
  white: "#e0e0e0",
  brightBlack: "#5c5c5c",
  brightRed: "#ff9aa2",
  brightGreen: "#9be3b8",
  brightYellow: "#ffd08a",
  brightBlue: "#a3ccff",
  brightMagenta: "#c9a7ff",
  brightCyan: "#7cd0da",
  brightWhite: "#fafafa",
};

/** Aura ANSI palette (daltonmenezes/aura-theme, MIT). */
const AURA_TERMINAL_THEME = {
  background: "#15141b",
  foreground: "#cdccce",
  cursor: "#a277ff",
  cursorAccent: "#15141b",
  selectionBackground: "#3d375e7f",
  black: "#15141b",
  red: "#ff6767",
  green: "#61ffca",
  yellow: "#ffca85",
  blue: "#a277ff",
  magenta: "#61ffca",
  cyan: "#a277ff",
  white: "#cdccce",
  brightBlack: "#2d2d2d",
  brightRed: "#ffca85",
  brightGreen: "#a277ff",
  brightYellow: "#ffca85",
  brightBlue: "#a277ff",
  brightMagenta: "#61ffca",
  brightCyan: "#61ffca",
  brightWhite: "#edecee",
};

/** Slack Aubergine ANSI palette (slack-theme/visual-studio-code, MIT). */
const SLACK_TERMINAL_THEME = {
  background: "#3e313c",
  foreground: "#f6f6f4",
  cursor: "#3e9689",
  cursorAccent: "#3e313c",
  selectionBackground: "#8a7a86",
  black: "#000000",
  red: "#e53935",
  green: "#91b859",
  yellow: "#ffb62c",
  blue: "#6182b8",
  magenta: "#7c4dff",
  cyan: "#39adb5",
  white: "#ffffff",
  brightBlack: "#90a4ae",
  brightRed: "#e53935",
  brightGreen: "#91b859",
  brightYellow: "#ffb62c",
  brightBlue: "#6182b8",
  brightMagenta: "#7c4dff",
  brightCyan: "#39adb5",
  brightWhite: "#ffffff",
};

/** Bluloco Dark ANSI palette (uloco/theme-bluloco-dark, LGPL-3.0). */
const BLULOCO_TERMINAL_THEME = {
  background: "#282c34",
  foreground: "#abb2bf",
  cursor: "#ffcc00",
  cursorAccent: "#282c34",
  selectionBackground: "#0084ff4b",
  black: "#42444d",
  red: "#fc2f52",
  green: "#25a45c",
  yellow: "#ff936a",
  blue: "#3375fe",
  magenta: "#9f7efe",
  cyan: "#4483aa",
  white: "#cdd3e0",
  brightBlack: "#8f9aae",
  brightRed: "#ff6480",
  brightGreen: "#3fc56b",
  brightYellow: "#f9c859",
  brightBlue: "#10b1fe",
  brightMagenta: "#ff78f8",
  brightCyan: "#5fb9bc",
  brightWhite: "#ffffff",
};

/** Om Theme ANSI palette (luizomf/omtheme, MIT). */
const OM_TERMINAL_THEME = {
  background: "#13141f",
  foreground: "#f8f8f2",
  cursor: "#bd93f9",
  cursorAccent: "#13141f",
  selectionBackground: "#44475a75",
  black: "#21222c",
  red: "#ff5555",
  green: "#50fa7b",
  yellow: "#f1fa8c",
  blue: "#bd93f9",
  magenta: "#ff79c6",
  cyan: "#8be9fd",
  white: "#f8f8f2",
  brightBlack: "#6272a4",
  brightRed: "#ff6e6e",
  brightGreen: "#69ff94",
  brightYellow: "#ffffa5",
  brightBlue: "#d6acff",
  brightMagenta: "#ff92df",
  brightCyan: "#a4ffff",
  brightWhite: "#ffffff",
};

/** Vim/Gruvbox ANSI palette (Harry-Hopkinson/vim-vscode-theme, MIT). */
const VIM_TERMINAL_THEME = {
  background: "#282828",
  foreground: "#ebdbb2",
  cursor: "#ebdbb2",
  cursorAccent: "#282828",
  selectionBackground: "#689d6a40",
  black: "#3c3836",
  red: "#cc241d",
  green: "#98971a",
  yellow: "#d79921",
  blue: "#458588",
  magenta: "#b16286",
  cyan: "#689d6a",
  white: "#a89984",
  brightBlack: "#928374",
  brightRed: "#fb4934",
  brightGreen: "#b8bb26",
  brightYellow: "#fabd2f",
  brightBlue: "#83a598",
  brightMagenta: "#d3869b",
  brightCyan: "#8ec07c",
  brightWhite: "#ebdbb2",
};

/** Light console palette used by Radar's light mode and forced-light terminal. */
const LIGHT_TERMINAL_THEME = {
  background: "#f8fbfe",
  foreground: "#1a1c20",
  cursor: "#4a7cc9",
  cursorAccent: "#f8fbfe",
  selectionBackground: "#4a7cc933",
  black: "#1a1c20",
  red: "#b31d28",
  green: "#0f7b4a",
  yellow: "#8a6d00",
  blue: "#1f5fa8",
  magenta: "#8b3a9c",
  cyan: "#0e7490",
  white: "#e6e9ee",
  brightBlack: "#6b7080",
  brightRed: "#d1242f",
  brightGreen: "#0b8a52",
  brightYellow: "#a16207",
  brightBlue: "#2563eb",
  brightMagenta: "#a21caf",
  brightCyan: "#0891b2",
  brightWhite: "#ffffff",
};

/** White theme's terminal (clean white surfaces, blue cursor). */
const WHITE_TERMINAL_THEME = {
  background: "#ffffff",
  foreground: "#111827",
  cursor: "#2563eb",
  cursorAccent: "#ffffff",
  selectionBackground: "#bfdbfe",
  black: "#111827",
  red: "#b91c1c",
  green: "#15803d",
  yellow: "#a16207",
  blue: "#2563eb",
  magenta: "#a21caf",
  cyan: "#0e7490",
  white: "#e5e7eb",
  brightBlack: "#6b7280",
  brightRed: "#dc2626",
  brightGreen: "#16a34a",
  brightYellow: "#ca8a04",
  brightBlue: "#3b82f6",
  brightMagenta: "#c026d3",
  brightCyan: "#0891b2",
  brightWhite: "#ffffff",
};

/** GitHub Light ANSI palette (yunlingz/vscode-theme-github-light, BSD-2-Clause). */
const GITHUB_LIGHT_TERMINAL_THEME = {
  background: "#ffffff",
  foreground: "#24292e",
  cursor: "#d73a49",
  cursorAccent: "#ffffff",
  selectionBackground: "#fed442",
  black: "#24292e",
  red: "#d73a49",
  green: "#22863a",
  yellow: "#b08800",
  blue: "#005cc5",
  magenta: "#6f42c1",
  cyan: "#1b7c83",
  white: "#6a737d",
  brightBlack: "#959da5",
  brightRed: "#cb2431",
  brightGreen: "#28a745",
  brightYellow: "#dbab09",
  brightBlue: "#2188ff",
  brightMagenta: "#8a63d2",
  brightCyan: "#3192aa",
  brightWhite: "#ffffff",
};

function darkTerminalFor(name: string) {
  switch (name) {
    case "dracula":
      return DRACULA_TERMINAL_THEME;
    case "freelens":
      return FREELENS_TERMINAL_THEME;
    case "proton":
      return PROTON_TERMINAL_THEME;
    case "synthwave":
      return SYNTHWAVE_TERMINAL_THEME;
    case "islands":
      return ISLANDS_TERMINAL_THEME;
    case "github":
      return GITHUB_TERMINAL_THEME;
    case "github-light":
      return GITHUB_TERMINAL_THEME;
    case "night-owl":
      return NIGHT_OWL_TERMINAL_THEME;
    case "material":
      return MATERIAL_TERMINAL_THEME;
    case "one-dark":
      return ONE_DARK_TERMINAL_THEME;
    case "one-dark-pro":
      return ONE_DARK_PRO_TERMINAL_THEME;
    case "catppuccin":
      return CATPPUCCIN_TERMINAL_THEME;
    case "jellybeans":
      return JELLYBEANS_TERMINAL_THEME;
    case "adwaita":
      return ADWAITA_TERMINAL_THEME;
    case "copilot":
      return COPILOT_TERMINAL_THEME;
    case "min":
      return MIN_TERMINAL_THEME;
    case "aura":
      return AURA_TERMINAL_THEME;
    case "slack":
      return SLACK_TERMINAL_THEME;
    case "bluloco":
      return BLULOCO_TERMINAL_THEME;
    case "om":
      return OM_TERMINAL_THEME;
    case "vim":
      return VIM_TERMINAL_THEME;
    default:
      return RADAR_TERMINAL_THEME;
  }
}

function lightTerminalFor(name: string) {
  if (name === "white") return WHITE_TERMINAL_THEME;
  if (name === "github-light") return GITHUB_LIGHT_TERMINAL_THEME;
  return LIGHT_TERMINAL_THEME;
}

function terminalThemeFor(name: string, mode: "match" | "dark" | "light", shellDark: boolean) {
  if (mode === "light") return lightTerminalFor(name);
  if (mode === "dark") return darkTerminalFor(name);
  return shellDark ? darkTerminalFor(name) : lightTerminalFor(name);
}


export function TerminalView({ target, active }: { target: TerminalTarget; active: boolean }) {
  const settings = useCatalogStore((state) => state.settings);
  const allClusters = useCatalogStore((state) => state.allClusters);
  const clusterLabel = target.clusterId
    ? (allClusters.find((cluster) => cluster.id === target.clusterId)?.name ?? "cluster")
    : "local";
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const sessionRef = useRef(`term-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  // Read inside xterm callbacks; the terminal itself is created only once.
  const copyOnSelectRef = useRef(false);
  copyOnSelectRef.current = settings?.terminalCopyOnSelect ?? false;
  const [status, setStatus] = useState<"connecting" | "ready" | "closed" | "error">("connecting");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // xterm takes px only, so the scale is applied here rather than via the CSS var.
  const fontSize = Math.max(6, Math.round((settings?.terminalFontSize ?? 13) * (settings?.fontScale ?? 1)));
  const fontFamily = settings?.terminalFontFamily ?? "DM Mono";
  const themeName = settings?.colorTheme ?? "radar";
  const terminalMode = settings?.terminalTheme ?? "match";
  // The shell applies `.dark` from AppShell; watch it so "match" follows the
  // Light/Dark/System button (and OS changes) without remounting the terminal.
  const [shellDark, setShellDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const root = document.documentElement;
    const update = () => setShellDark(root.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  const terminalTheme = useMemo(
    () => terminalThemeFor(themeName, terminalMode, shellDark),
    [themeName, terminalMode, shellDark],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const sessionId = sessionRef.current;
    const isExec = target.type === "pod";

    const terminal = new XTerm({
      cursorBlink: true,
      fontFamily: `"${fontFamily}", ui-monospace, Menlo, Monaco, monospace`,
      fontSize,
      lineHeight: 1.2,
      allowProposedApi: true,
      scrollback: 5000,
      theme: terminalTheme,
      macOptionIsMeta: true,
    });
    const fit = new FitAddon();
    const search = new SearchAddon();
    terminal.loadAddon(fit);
    terminal.loadAddon(search);
    terminal.loadAddon(new WebLinksAddon());
    terminal.open(container);
    xtermRef.current = terminal;
    fitRef.current = fit;
    searchRef.current = search;

    const sendInput = (data: string) => {
      void (isExec ? api.exec.input(sessionId, data) : api.terminal.input(sessionId, data));
    };

    terminal.onData(sendInput);
    terminal.onSelectionChange(() => {
      if (!copyOnSelectRef.current || !terminal.hasSelection()) return;
      void navigator.clipboard.writeText(terminal.getSelection());
    });

    const offData = isExec
      ? api.exec.onData((payload) => {
          if (payload.sessionId === sessionId) terminal.write(payload.data);
        })
      : api.terminal.onData((payload) => {
          if (payload.sessionId === sessionId) terminal.write(payload.data);
        });

    const offExit = isExec
      ? api.exec.onExit((payload) => {
          if (payload.sessionId !== sessionId) return;
          setStatus(payload.error ? "error" : "closed");
          terminal.write(
            `\r\n\x1b[38;5;244m[process exited${payload.exitCode !== null ? ` with code ${payload.exitCode}` : ""}${payload.error ? `: ${payload.error}` : ""}]\x1b[0m\r\n`,
          );
          // The most common exec failure: the container simply has no shell at
          // that path (distroless images). Say what to do instead of leaving
          // the OCI error as the only clue.
          if (payload.error && /no such file|executable file not found|not found in \$PATH/i.test(payload.error)) {
            terminal.write(
              "\x1b[38;5;244m[hint] That shell does not exist in this container. Reopen Exec and try /bin/bash, /bin/ash, or a debug shell.\x1b[0m\r\n",
            );
          }
        })
      : api.terminal.onExit((payload) => {
          if (payload.sessionId !== sessionId) return;
          setStatus(payload.error ? "error" : "closed");
          terminal.write(`\r\n\x1b[38;5;244m[shell exited: ${payload.exitCode ?? "?"}]\x1b[0m\r\n`);
        });

    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") return true;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "c" && terminal.hasSelection()) {
        void navigator.clipboard.writeText(terminal.getSelection());
        terminal.clearSelection();
        return false;
      }
      // Cmd/Ctrl+V is intentionally NOT handled here: xterm's own textarea
      // receives the native `paste` event and writes once. Reading the
      // clipboard manually on top of that pasted everything twice.
      if (mod && event.key.toLowerCase() === "f") {
        setSearchOpen(true);
        return false;
      }
      return true;
    });

    const doFit = () => {
      try {
        fit.fit();
      } catch {
        // container might be hidden during the first frame
      }
    };

    requestAnimationFrame(() => {
      doFit();
      const cols = terminal.cols || 80;
      const rows = terminal.rows || 24;
      if (isExec) {
        const attach = target.mode === "attach";
        void api.exec
          .start({
            sessionId,
            clusterId: target.clusterId,
            namespace: target.namespace,
            pod: target.pod,
            container: target.container,
            command: attach ? [] : podCommandArgv(target.shell),
            tty: !attach,
            cols,
            rows,
            mode: attach ? "attach" : "exec",
          })
          .then(() => setStatus("ready"))
          .catch((error) => {
            setStatus("error");
            toast.error(attach ? "Pod attach failed" : "Pod exec failed", errorText(error));
            terminal.write(`\x1b[31m${errorText(error)}\x1b[0m\r\n`);
          });
      } else {
        void api.terminal
          .create({
            sessionId,
            cols,
            rows,
            shell: settings?.defaultShell?.trim() || undefined,
            clusterId: target.type === "local" ? target.clusterId : undefined,
            namespace: target.type === "local" ? target.namespace : undefined,
          })
          .then(({ shell }) => {
            setStatus("ready");
            terminal.write(`\x1b[38;5;244m[${shell} on ${navigator.platform}]\x1b[0m\r\n`);
          })
          .catch((error) => {
            setStatus("error");
            terminal.write(`\x1b[31m${errorText(error)}\x1b[0m\r\n`);
          });
      }
    });

    const observer = new ResizeObserver(() => {
      doFit();
      const cols = terminal.cols;
      const rows = terminal.rows;
      if (!cols || !rows) return;
      void (isExec ? api.exec.resize(sessionId, cols, rows) : api.terminal.resize(sessionId, cols, rows));
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      offData();
      offExit();
      void (isExec ? api.exec.close(sessionId) : api.terminal.close(sessionId)).catch(() => undefined);
      terminal.dispose();
      xtermRef.current = null;
      fitRef.current = null;
      searchRef.current = null;
    };
    // The session is intentionally created once per mounted terminal tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  useEffect(() => {
    const terminal = xtermRef.current;
    if (terminal) terminal.options.theme = terminalTheme;
  }, [terminalTheme]);

  useEffect(() => {
    const terminal = xtermRef.current;
    if (!terminal) return;
    terminal.options.fontSize = fontSize;
    terminal.options.fontFamily = `"${fontFamily}", ui-monospace, Menlo, Monaco, monospace`;
    const timer = window.setTimeout(() => {
      fitRef.current?.fit();
      // A font change reflows the grid, so the PTY must learn the new
      // geometry — same as the ResizeObserver path.
      const sessionId = sessionRef.current;
      const isExec = target.type === "pod";
      const cols = terminal.cols;
      const rows = terminal.rows;
      if (!cols || !rows) return;
      void (isExec ? api.exec.resize(sessionId, cols, rows) : api.terminal.resize(sessionId, cols, rows));
    }, 30);
    return () => window.clearTimeout(timer);
  }, [fontSize, fontFamily]);

  useEffect(() => {
    if (!active) return;
    const terminal = xtermRef.current;
    if (!terminal) return;
    const timer = window.setTimeout(() => {
      fitRef.current?.fit();
      terminal.focus();
    }, 30);
    return () => window.clearTimeout(timer);
  }, [active]);

  return (
    <div
      className={cn("terminal-surface absolute inset-0 flex flex-col", !active && "invisible")}
      style={{ backgroundColor: terminalTheme.background }}
    >
      <div className="flex h-6 shrink-0 items-center gap-2 border-b border-theme-border bg-theme-surface px-2 text-[calc(10px*var(--font-scale))] text-theme-text-tertiary">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            status === "ready"
              ? "bg-emerald-500"
              : status === "error"
                ? "bg-red-500"
                : status === "closed"
                  ? "bg-slate-500"
                  : "animate-pulse bg-amber-500",
          )}
        />
        <span className="truncate">
          {target.type === "pod"
            ? `${clusterLabel} · ${target.namespace}/${target.pod} · ${target.container}`
            : `${clusterLabel}${target.namespace ? ` · ${target.namespace}` : ""}`}
        </span>
        <span className="ml-auto">{status}</span>
        <button
          type="button"
          className="rounded p-0.5 text-theme-text-tertiary hover:bg-theme-hover hover:text-theme-text-primary"
          title="Search terminal"
          onClick={() => setSearchOpen((value) => !value)}
        >
          <Search className="h-3 w-3" />
        </button>
        {searchOpen ? (
          <div className="absolute right-2 top-1 z-20 flex items-center gap-1 rounded border border-theme-border bg-theme-surface px-1 py-0.5 shadow-lg">
            <input
              autoFocus
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                searchRef.current?.findNext(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  if (event.shiftKey) searchRef.current?.findPrevious(searchTerm);
                  else searchRef.current?.findNext(searchTerm);
                }
                if (event.key === "Escape") setSearchOpen(false);
              }}
              placeholder="Find…"
              className="h-5 w-40 bg-transparent px-1 text-[calc(11px*var(--font-scale))] text-theme-text-primary placeholder:text-theme-text-tertiary focus:outline-none"
            />
            <button
              type="button"
              className="rounded p-0.5 text-theme-text-tertiary hover:text-theme-text-primary"
              onClick={() => searchRef.current?.findPrevious(searchTerm)}
            >
              <ChevronUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              className="rounded p-0.5 text-theme-text-tertiary hover:text-theme-text-primary"
              onClick={() => searchRef.current?.findNext(searchTerm)}
            >
              <ChevronDown className="h-3 w-3" />
            </button>
            <button
              type="button"
              className="rounded p-0.5 text-theme-text-tertiary hover:text-theme-text-primary"
              onClick={() => setSearchOpen(false)}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : null}
      </div>
      <div
        ref={containerRef}
        className="min-h-0 flex-1 p-1"
        style={{ backgroundColor: terminalTheme.background }}
      />
    </div>
  );
}
