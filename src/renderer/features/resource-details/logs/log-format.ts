/**
 * Log parsing, timestamp formatting, ANSI rendering and JSON/logfmt
 * tokenisation, ported from Radar's viewer so mLens reads log lines the same
 * way: severity from the line itself, RFC3339 timestamps split from the
 * message, ANSI colours and structured records.
 */

export type TimestampFormat = "time-local" | "time-utc" | "iso-local" | "iso-utc" | "relative" | "epoch";

export const TIMESTAMP_FORMAT_LABELS: Record<TimestampFormat, string> = {
  "time-local": "Time (local)",
  "time-utc": "Time (UTC)",
  "iso-local": "ISO (local)",
  "iso-utc": "ISO (UTC)",
  relative: "Relative",
  epoch: "Epoch",
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatIsoLocal(date: Date): string {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  return (
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` +
    `T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}` +
    `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`
  );
}

function formatRelative(date: Date, now: number): string {
  const diffSec = Math.round((now - date.getTime()) / 1000);
  const abs = Math.abs(diffSec);
  const suffix = diffSec >= 0 ? " ago" : " from now";
  if (abs < 2) return "just now";
  if (abs < 60) return `${abs}s${suffix}`;
  if (abs < 3600) return `${Math.floor(abs / 60)}m${suffix}`;
  if (abs < 86400) return `${Math.floor(abs / 3600)}h${suffix}`;
  return `${Math.floor(abs / 86400)}d${suffix}`;
}

/** Format a Kubernetes log timestamp for display. */
export function formatLogTimestamp(ts: string, format: TimestampFormat = "time-local", now?: number): string {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return ts.slice(11, 19) || ts;
  switch (format) {
    case "time-utc":
      return date.toISOString().slice(11, 19);
    case "iso-local":
      return formatIsoLocal(date);
    case "iso-utc":
      return date.toISOString();
    case "relative":
      return formatRelative(date, now ?? Date.now());
    case "epoch":
      return String(Math.floor(date.getTime() / 1000));
    case "time-local":
    default:
      return date.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
}

/** Escape special regex characters in a string. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Highlight search matches as an HTML string (safe for innerHTML). Literal
 * queries are escaped; regex queries fall back to a literal when invalid.
 */
export function highlightSearchMatches(
  text: string,
  query: string,
  isRegex = false,
  isCaseSensitive = false,
): string {
  if (!query) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const flags = isCaseSensitive ? "g" : "gi";
  let pattern: string;
  if (isRegex) {
    try {
      // Validate against the raw query first, then match on escaped text.
      new RegExp(query);
      pattern = escapeHtml(query);
    } catch {
      pattern = escapeRegExp(escapeHtml(query));
    }
  } else {
    pattern = escapeRegExp(escapeHtml(query));
  }
  const regex = new RegExp(`(${pattern})`, flags);
  return escaped.replace(regex, '<mark class="log-highlight">$1</mark>');
}

/** Strip ANSI escape sequences (CSI colour codes) from log text. */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

// Standard 256-colour palette (indices 0-255): 16 system colours, a 6×6×6
// cube and 24 greys.
const ANSI_256_COLORS: string[] = (() => {
  const colors: string[] = [
    "#4c4c4c", "#cd3131", "#0dbc79", "#e5e510", "#2472c8", "#bc3fbc", "#11a8cd", "#e5e5e5",
    "#767676", "#f14c4c", "#23d18b", "#f5f543", "#3b8eea", "#d670d6", "#29b8db", "#e5e5e5",
  ];
  const levels = [0, 95, 135, 175, 215, 255];
  for (let r = 0; r < 6; r += 1) {
    for (let g = 0; g < 6; g += 1) {
      for (let b = 0; b < 6; b += 1) {
        colors.push(`#${levels[r].toString(16).padStart(2, "0")}${levels[g].toString(16).padStart(2, "0")}${levels[b].toString(16).padStart(2, "0")}`);
      }
    }
  }
  for (let i = 0; i < 24; i += 1) {
    const v = (8 + i * 10).toString(16).padStart(2, "0");
    colors.push(`#${v}${v}${v}`);
  }
  return colors;
})();

const SGR_STYLES: Record<number, string> = {
  1: "font-weight:bold",
  2: "opacity:0.6",
  3: "font-style:italic",
  4: "text-decoration:underline",
  30: "color:var(--ansi-black)",
  31: "color:var(--ansi-red)",
  32: "color:var(--ansi-green)",
  33: "color:var(--ansi-yellow)",
  34: "color:var(--ansi-blue)",
  35: "color:var(--ansi-magenta)",
  36: "color:var(--ansi-cyan)",
  37: "color:var(--ansi-white)",
  40: "background-color:var(--ansi-black)",
  41: "background-color:var(--ansi-red)",
  42: "background-color:var(--ansi-green)",
  43: "background-color:var(--ansi-yellow)",
  44: "background-color:var(--ansi-blue)",
  45: "background-color:var(--ansi-magenta)",
  46: "background-color:var(--ansi-cyan)",
  47: "background-color:var(--ansi-white)",
  90: "color:var(--ansi-bright-black)",
  91: "color:var(--ansi-bright-red)",
  92: "color:var(--ansi-bright-green)",
  93: "color:var(--ansi-bright-yellow)",
  94: "color:var(--ansi-bright-blue)",
  95: "color:var(--ansi-bright-magenta)",
  96: "color:var(--ansi-bright-cyan)",
  97: "color:var(--ansi-bright-white)",
  100: "background-color:var(--ansi-bright-black)",
  101: "background-color:var(--ansi-bright-red)",
  102: "background-color:var(--ansi-bright-green)",
  103: "background-color:var(--ansi-bright-yellow)",
  104: "background-color:var(--ansi-bright-blue)",
  105: "background-color:var(--ansi-bright-magenta)",
  106: "background-color:var(--ansi-bright-cyan)",
  107: "background-color:var(--ansi-bright-white)",
};

const ANSI_16_NAMES = [
  "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
  "bright-black", "bright-red", "bright-green", "bright-yellow", "bright-blue", "bright-magenta", "bright-cyan", "bright-white",
];

function resolveSgrStyles(codes: number[]): string {
  const parts: string[] = [];
  let i = 0;
  while (i < codes.length) {
    if (codes[i] === 38 && codes[i + 1] === 2 && codes[i + 4] !== undefined) {
      parts.push(`color:rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`);
      i += 5;
      continue;
    }
    if (codes[i] === 48 && codes[i + 1] === 2 && codes[i + 4] !== undefined) {
      parts.push(`background-color:rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`);
      i += 5;
      continue;
    }
    if (codes[i] === 38 && codes[i + 1] === 5 && codes[i + 2] !== undefined) {
      const colorIdx = codes[i + 2];
      if (colorIdx >= 0 && colorIdx < 16) parts.push(`color:var(--ansi-${ANSI_16_NAMES[colorIdx]})`);
      else if (colorIdx < 256) parts.push(`color:${ANSI_256_COLORS[colorIdx]}`);
      i += 3;
      continue;
    }
    if (codes[i] === 48 && codes[i + 1] === 5 && codes[i + 2] !== undefined) {
      const colorIdx = codes[i + 2];
      if (colorIdx >= 0 && colorIdx < 16) parts.push(`background-color:var(--ansi-${ANSI_16_NAMES[colorIdx]})`);
      else if (colorIdx < 256) parts.push(`background-color:${ANSI_256_COLORS[colorIdx]}`);
      i += 3;
      continue;
    }
    const style = SGR_STYLES[codes[i]];
    if (style) parts.push(style);
    i += 1;
  }
  return parts.join(";");
}

/**
 * Convert ANSI SGR escape codes to styled spans. The text is HTML-escaped
 * first, every opened span is closed before returning, and only SGR sequences
 * are rendered — other ANSI controls are dropped.
 */
export function ansiToHtml(text: string): string {
  const escaped = escapeHtml(text);
  let result = "";
  let openSpans = 0;
  // eslint-disable-next-line no-control-regex
  const ansiRe = /\x1b\[([0-9;]*)m/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = ansiRe.exec(escaped)) !== null) {
    result += escaped.slice(lastIndex, match.index);
    lastIndex = match.index + match[0].length;
    const codes = match[1] === "" ? [0] : match[1].split(";").map(Number);
    const resetIdx = codes.indexOf(0);
    if (resetIdx !== -1) {
      result += "</span>".repeat(openSpans);
      openSpans = 0;
      const afterReset = codes.slice(resetIdx + 1);
      const styles = resolveSgrStyles(afterReset);
      if (styles) {
        result += `<span style="${styles}">`;
        openSpans += 1;
      }
    } else {
      const styles = resolveSgrStyles(codes);
      if (styles) {
        result += `<span style="${styles}">`;
        openSpans += 1;
      }
    }
  }

  result += escaped.slice(lastIndex);
  result += "</span>".repeat(openSpans);
  return result;
}

/**
 * Split an RFC3339 timestamp from a Kubernetes log line. Lines without one
 * (timestamps disabled in the stream, or plain output) keep all their text.
 */
export function parseLogLine(line: string): { timestamp: string; content: string } {
  if (line.length > 30 && line[4] === "-" && line[7] === "-" && line[10] === "T") {
    const spaceIdx = line.indexOf(" ");
    if (spaceIdx > 20 && spaceIdx < 40) {
      return { timestamp: line.slice(0, spaceIdx), content: line.slice(spaceIdx + 1) };
    }
  }
  return { timestamp: "", content: line };
}

export interface JsonToken {
  type: "text" | "key" | "string" | "number" | "boolean" | "null";
  value: string;
}

function jsonStringEnd(text: string, start: number): number {
  let offset = start + 1;
  while (offset < text.length) {
    const char = text[offset];
    offset += 1;
    if (char === "\\") offset += 1;
    else if (char === '"') return offset;
  }
  return -1;
}

export function tokenizeJson(text: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  const primitiveRe = /(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|\b(true|false)\b|\b(null)\b/y;
  let copied = 0;
  let offset = 0;
  while (offset < text.length) {
    const start = offset;
    let type: JsonToken["type"];
    let value: string;
    if (text[offset] === '"') {
      const end = jsonStringEnd(text, offset);
      if (end < 0) break;
      value = text.slice(start, end);
      let colon = end;
      while (colon < text.length && /\s/.test(text[colon])) colon += 1;
      type = text[colon] === ":" ? "key" : "string";
      offset = type === "key" ? colon + 1 : end;
    } else {
      primitiveRe.lastIndex = offset;
      const match = primitiveRe.exec(text);
      if (!match) {
        offset += 1;
        continue;
      }
      type = match[1] !== undefined ? "number" : match[2] !== undefined ? "boolean" : "null";
      value = match[0];
      offset = primitiveRe.lastIndex;
    }
    if (start > copied) tokens.push({ type: "text", value: text.slice(copied, start) });
    tokens.push({ type, value });
    copied = offset;
  }
  if (copied < text.length) tokens.push({ type: "text", value: text.slice(copied) });
  return tokens;
}

/**
 * Convert escaped `\n`, `\r\n` and `\t` inside JSON string values to real
 * whitespace, so stack traces stay readable in the expanded view.
 */
export function unescapeJsonStrings(text: string): string {
  let result = "";
  let copied = 0;
  let offset = 0;
  while (offset < text.length) {
    offset += 1;
    if (text[offset - 1] !== '"') continue;
    const start = offset - 1;
    offset = jsonStringEnd(text, start);
    if (offset < 0) break;
    result +=
      text.slice(copied, start) +
      text
        .slice(start, offset)
        .replace(/\\r\\n/g, "\r\n")
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t");
    copied = offset;
  }
  return result + text.slice(copied);
}

const LOGFMT_PAIR_RE = /(?:^|\s)([a-zA-Z_][\w.]*)=((?:"(?:[^"\\]|\\.)*")|(?:[^\s]*))/g;

/** Detect logfmt (`key=value` pairs covering most of the line). */
export function isLogfmt(content: string): boolean {
  const trimmed = content.trimStart();
  if (trimmed[0] === "{") return false;
  const matches = trimmed.match(LOGFMT_PAIR_RE);
  if (!matches || matches.length < 3) return false;
  const matchedLength = matches.reduce((sum, entry) => sum + entry.trim().length, 0);
  return matchedLength / trimmed.length >= 0.6;
}

export function parseLogfmt(content: string): Record<string, string> | null {
  const result: Record<string, string> = {};
  let count = 0;
  const re = new RegExp(LOGFMT_PAIR_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    let val = match[2];
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\t/g, "\t");
    }
    result[match[1]] = val;
    count += 1;
  }
  return count >= 2 ? result : null;
}
