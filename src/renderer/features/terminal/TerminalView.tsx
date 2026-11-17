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
import { toast } from "../../design-system/components/Toast";

const RADAR_TERMINAL_THEME = {
  background: "#0f172a",
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

export function TerminalView({ target, active }: { target: TerminalTarget; active: boolean }) {
  const settings = useCatalogStore((state) => state.settings);
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const sessionRef = useRef(`term-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const [status, setStatus] = useState<"connecting" | "ready" | "closed" | "error">("connecting");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const fontSize = settings?.terminalFontSize ?? 13;
  const fontFamily = settings?.terminalFontFamily ?? "DM Mono";
  const themeName = settings?.colorTheme ?? "radar";
  const terminalTheme = useMemo(
    () =>
      themeName === "dracula"
        ? DRACULA_TERMINAL_THEME
        : themeName === "freelens"
          ? FREELENS_TERMINAL_THEME
          : RADAR_TERMINAL_THEME,
    [themeName],
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
      if (mod && event.key.toLowerCase() === "v") {
        void navigator.clipboard.readText().then(sendInput).catch(() => undefined);
        return false;
      }
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
        void api.exec
          .start({
            sessionId,
            clusterId: target.clusterId,
            namespace: target.namespace,
            pod: target.pod,
            container: target.container,
            command: [target.shell ?? "/bin/sh"],
            tty: true,
            cols,
            rows,
          })
          .then(() => setStatus("ready"))
          .catch((error) => {
            setStatus("error");
            toast.error("Pod exec failed", errorText(error));
            terminal.write(`\x1b[31m${errorText(error)}\x1b[0m\r\n`);
          });
      } else {
        void api.terminal
          .create({
            sessionId,
            cols,
            rows,
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
    const timer = window.setTimeout(() => fitRef.current?.fit(), 30);
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
    <div className={cn("absolute inset-0 flex flex-col bg-[#0f172a]", !active && "invisible")}>
      <div className="flex h-6 shrink-0 items-center gap-2 border-b border-white/10 bg-[#111b2e] px-2 text-[10px] text-slate-500">
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
            ? `${target.namespace}/${target.pod} · ${target.container}`
            : "Local shell"}
        </span>
        <span className="ml-auto">{status}</span>
        <button
          type="button"
          className="rounded p-0.5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
          title="Search terminal"
          onClick={() => setSearchOpen((value) => !value)}
        >
          <Search className="h-3 w-3" />
        </button>
        {searchOpen ? (
          <div className="absolute right-2 top-1 z-20 flex items-center gap-1 rounded border border-white/15 bg-[#111b2e] px-1 py-0.5 shadow-lg">
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
              className="h-5 w-40 bg-transparent px-1 text-[11px] text-slate-200 placeholder:text-slate-500 focus:outline-none"
            />
            <button
              type="button"
              className="rounded p-0.5 text-slate-400 hover:text-slate-100"
              onClick={() => searchRef.current?.findPrevious(searchTerm)}
            >
              <ChevronUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              className="rounded p-0.5 text-slate-400 hover:text-slate-100"
              onClick={() => searchRef.current?.findNext(searchTerm)}
            >
              <ChevronDown className="h-3 w-3" />
            </button>
            <button
              type="button"
              className="rounded p-0.5 text-slate-400 hover:text-slate-100"
              onClick={() => setSearchOpen(false)}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : null}
      </div>
      <div
        ref={containerRef}
        className="min-h-0 flex-1 bg-[#0f172a] p-1 [&_.xterm-viewport]:!bg-[#0f172a]"
      />
    </div>
  );
}
