import { stripAnsi } from "./log-format";
import type { LevelSource, LogLevel } from "./log-types";

export interface DetectedLevel {
  level: LogLevel;
  source: LevelSource;
}

const ERROR_NAMES = new Set([
  "error", "err", "eror", "fatal", "ftl", "panic", "pnc", "dpanic",
  "critical", "crit", "alert", "emerg", "emergency", "severe",
]);
const WARN_NAMES = new Set(["warn", "warning", "wrn"]);
const INFO_NAMES = new Set(["info", "inf", "information", "notice", "log"]);
const DEBUG_NAMES = new Set(["debug", "dbg", "debg", "trace", "trc", "verbose", "fine", "finer", "finest"]);

function levelFromNumber(n: number): LogLevel {
  // Pino/bunyan: 10 trace, 20 debug, 30 info, 40 warn, 50 error, 60 fatal.
  if (n >= 50) return "error";
  if (n >= 40) return "warn";
  if (n >= 30) return "info";
  return "debug";
}

/** Map a raw level value to a level; null means the value says nothing. */
export function normalizeLevel(raw: unknown): LogLevel | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? levelFromNumber(raw) : null;
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (/^\d+$/.test(value)) return levelFromNumber(Number(value));
  if (ERROR_NAMES.has(value)) return "error";
  if (WARN_NAMES.has(value)) return "warn";
  if (INFO_NAMES.has(value)) return "info";
  if (DEBUG_NAMES.has(value)) return "debug";
  // zap/logr verbosity levels render as LEVEL(-2).
  if (/^level\(-\d+\)$/.test(value)) return "debug";
  return "unknown";
}

// PostgreSQL writes every DEBUGn severity as DEBUG.
const POSTGRES_SEVERITIES: Record<string, LogLevel> = {
  DEBUG: "debug", LOG: "info", INFO: "info", NOTICE: "info", WARNING: "warn", ERROR: "error", FATAL: "error", PANIC: "error",
};

const LEVEL_FIELD_KEYS = ["level", "lvl", "severity", "levelname", "log.level"] as const;

export function selectPostgresRecord(
  obj: Record<string, unknown>,
): { record: Record<string, unknown>; raw: string; level: LogLevel } | null {
  const record = obj.record;
  if (obj.logger !== "postgres" || obj.msg !== "record" || !record || typeof record !== "object" || Array.isArray(record)) {
    return null;
  }
  const fields = record as Record<string, unknown>;
  const raw = fields.error_severity;
  const level = typeof raw === "string" ? POSTGRES_SEVERITIES[raw.trim().toUpperCase()] : undefined;
  return typeof raw === "string" && level ? { record: fields, raw, level } : null;
}

/** Pick the level field of a structured record (shared with the badge text). */
export function selectLevelField(obj: Record<string, unknown>): { raw: unknown; level: LogLevel } | null {
  const pgRecord = selectPostgresRecord(obj);
  if (pgRecord) return { raw: pgRecord.raw, level: pgRecord.level };
  for (const key of LEVEL_FIELD_KEYS) {
    const level = normalizeLevel(obj[key]);
    if (level) return { raw: obj[key], level };
  }
  const log = obj.log;
  if (log && typeof log === "object" && !Array.isArray(log)) {
    const raw = (log as Record<string, unknown>).level;
    const level = normalizeLevel(raw);
    if (level) return { raw, level };
  }
  return null;
}

// Same tokenization as parseLogfmt: a quoted value is consumed whole, so a
// `level=` inside a quoted message is never read as the line's own level.
const LOGFMT_PAIR_RE = /(?:^|\s)([a-zA-Z_][\w.]*)=((?:"(?:[^"\\]|\\.)*")|(?:[^\s]*))/g;
const LOGFMT_LEVEL_KEYS = new Set(["level", "lvl", "severity", "log.level"]);
const LOGFMT_LEVEL_HINT = /(?:^|\s)(?:level|lvl|severity|log\.level)=/;

interface PlacedLevel {
  level: LogLevel;
  at: number;
}

function logfmtLevel(line: string): PlacedLevel | null {
  if (!LOGFMT_LEVEL_HINT.test(line)) return null;
  const re = LOGFMT_PAIR_RE;
  re.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    if (!LOGFMT_LEVEL_KEYS.has(match[1])) continue;
    let value = match[2];
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) value = value.slice(1, -1);
    const level = normalizeLevel(value);
    if (level) return { level, at: match.index };
  }
  return null;
}

// klog: Lmmdd hh:mm:ss.uuuuuu threadid file:line]
const KLOG_RE = /^([IWEF])\d{4} \d{2}:\d{2}:\d{2}\.\d+\s/;
const KLOG_LEVELS: Record<string, LogLevel> = { I: "info", W: "warn", E: "error", F: "error" };

// A standalone uppercase level word near the start of the line: zap and
// zerolog console output, logback/log4j, Python logging, NestJS. The window
// covers prefixes such as timestamps, thread names and agent tags.
const HEADER_WINDOW = 100;
const HEADER_TOKEN_RE = /(?:^|[\s[<|(])(TRACE|TRC|DEBUG|DBG|DEBG|VERBOSE|INFO|INF|LOG|NOTICE|WARN|WARNING|WRN|ERROR|ERR|FATAL|FTL|PANIC|PNC|DPANIC|CRITICAL|CRIT|SEVERE|LEVEL\(-\d+\))(?=$|[\s\]>|:)])/;
// `[error]` (nginx, envoy), `<Information>` (ClickHouse).
const BRACKETED_TOKEN_RE = /[[<](trace|debug|information|info|notice|warning|warn|error|critical|crit|alert|emerg|fatal)[\]>]/i;
// telegraf and the CloudWatch agent: `2026-09-29T20:38:42Z E! message`.
const BANG_PREFIX_RE = /^\S+\s([DIWE])!\s/;
const BANG_LEVELS: Record<string, LogLevel> = { D: "debug", I: "info", W: "warn", E: "error" };

function headerLevel(line: string): PlacedLevel | null {
  const klog = KLOG_RE.exec(line);
  if (klog) return { level: KLOG_LEVELS[klog[1]], at: 0 };
  const bang = BANG_PREFIX_RE.exec(line);
  if (bang) return { level: BANG_LEVELS[bang[1]], at: 0 };
  const head = line.slice(0, HEADER_WINDOW);
  const token = HEADER_TOKEN_RE.exec(head);
  const tokenLevel = token && normalizeLevel(token[1]);
  if (token && tokenLevel) return { level: tokenLevel, at: token.index };
  const bracketed = BRACKETED_TOKEN_RE.exec(head);
  const bracketedLevel = bracketed && normalizeLevel(bracketed[1]);
  if (bracketed && bracketedLevel) return { level: bracketedLevel, at: bracketed.index };
  return null;
}

// A word followed by `=` is a key name (`errors=0`, `debug=false`), and a JSON
// key with an empty value says nothing happened.
const NOT_A_KEY = String.raw`(?!\s*=)(?!"\s*:\s*(?:null|false|0|""|\[\]|\{\})\s*[,}])`;
const KEYWORD_ERROR_RE = new RegExp(String.raw`\b(?:error|fatal|panic|critical|crit|exception)\b${NOT_A_KEY}`);
const KEYWORD_WARN_RE = new RegExp(String.raw`\b(?:warn|warning)\b${NOT_A_KEY}`);
const KEYWORD_DEBUG_RE = new RegExp(String.raw`\bdebug\b${NOT_A_KEY}`);
const KEYWORD_INFO_RE = new RegExp(String.raw`\binfo\b${NOT_A_KEY}`);
const PYTHON_TRACEBACK_HEAD = "Traceback (most recent call last):";
// The unindented line that ends a traceback: `ValueError: bad`, `Exception: boom`.
const PYTHON_EXCEPTION_LINE_RE = /^[A-Za-z_][\w.]*(?::|$)/;
// The first line of an exception: `MongoServerError: ...`, `java.lang.IllegalStateException`.
const EXCEPTION_HEAD_RE = /^(?:(?:[\w$]+\.)*[A-Z][\w$]*(?:Error|Exception)(?: \[[\w-]+\])?(?::|\s*$)|Traceback \(most recent call last\):)/;

function keywordLevel(line: string): LogLevel | null {
  if (EXCEPTION_HEAD_RE.test(line)) return "error";
  const lower = line.toLowerCase();
  if (KEYWORD_ERROR_RE.test(lower)) return "error";
  if (KEYWORD_WARN_RE.test(lower)) return "warn";
  if (KEYWORD_DEBUG_RE.test(lower)) return "debug";
  if (KEYWORD_INFO_RE.test(lower)) return "info";
  return null;
}

/**
 * Resolve a log line's severity. Sources are tried from most to least
 * authoritative: a structured field, a header the logging library wrote, then
 * words in the message.
 */
export function detectLevel(content: string): DetectedLevel {
  const line = content.includes("\x1b") ? stripAnsi(content) : content;
  const trimmed = line.trim();

  if (trimmed[0] === "{" && trimmed[trimmed.length - 1] === "}") {
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        const selected = selectLevelField(obj as Record<string, unknown>);
        if (selected) return { level: selected.level, source: "structured" };
      }
    } catch {
      // Not JSON after all; fall through to header/keyword detection.
    }
  }

  // A console line can carry key=value pairs in its message, so between a
  // header level word and a `level=` pair the one written first is the line's own.
  const fromHeader = headerLevel(line.trimEnd());
  const fromLogfmt = trimmed[0] === "{" ? null : logfmtLevel(line.trimEnd());
  if (fromLogfmt && (!fromHeader || fromLogfmt.at <= fromHeader.at)) {
    return { level: fromLogfmt.level, source: "structured" };
  }
  if (fromHeader) return { level: fromHeader.level, source: "header" };

  const fromKeyword = keywordLevel(trimmed);
  if (fromKeyword) return { level: fromKeyword, source: "keyword" };
  return { level: "unknown", source: "none" };
}

const LEADING_ANSI_RE = /^(?:\x1b\[[0-9;]*m)+/;

// `goroutine 1 [running]:`, `main.main()`, `net/http.(*conn).serve(...)`,
// `created by net/http.(*Server).Serve in goroutine 1`.
const GO_PANIC_LINE_RE = /^(?:goroutine \d+ \[[^\]]*\]:$|created by \S+|[\w./-]*[\w)\]]\.[\w*().[\]{}-]*\((?:[^()]|\([^()]*\))*\)$)/;

/** Lines that continue the previous line's record: stack frames and wrapped detail. */
export function isContinuationLine(raw: string): boolean {
  return isIndented(raw) || looksLikeUnindentedFrame(raw);
}

function isIndented(raw: string): boolean {
  // Colored output (Node's inspector) can put an escape code ahead of the indentation.
  const content = raw.charCodeAt(0) === 0x1b ? raw.replace(LEADING_ANSI_RE, "") : raw;
  return /^\s/.test(content);
}

function looksLikeUnindentedFrame(content: string): boolean {
  if (/^(Caused by:|Suppressed:|\.\.\. \d+ more)/.test(content)) return true;
  // The closing bracket of an object printed across lines (Node's util.inspect).
  if (/^[}\])]+[;,]?$/.test(content)) return true;
  if (content.startsWith("goroutine ") || content.startsWith("created by ")) return GO_PANIC_LINE_RE.test(content);
  const paren = content.indexOf("(");
  if (paren <= 0 || !content.endsWith(")") || content.lastIndexOf(" ", paren) !== -1) return false;
  return GO_PANIC_LINE_RE.test(content);
}

interface AssociableEntry {
  content: string;
  level: LogLevel;
  levelSource?: LevelSource;
  pod?: string;
  container: string;
}

export interface ContinuationAssociation {
  /** Index of the record's first line for each entry; equals the entry's own index for a head. */
  headOf: number[];
  /** The level filters should use: a continuation carries its record's level. */
  effectiveLevel: LogLevel[];
}

/**
 * Link each continuation line to the record it belongs to, per pod and
 * container, so a filter keeps or drops a stack trace together with its first
 * line and interleaved pods never splice into each other's traces.
 */
export function associateContinuations(entries: readonly AssociableEntry[]): ContinuationAssociation {
  const headOf = new Array<number>(entries.length);
  const effectiveLevel = new Array<LogLevel>(entries.length);
  const lastHeadBySource = new Map<string, number>();
  const openTraceback = new Set<string>();
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const source = `${entry.pod ?? ""}\x00${entry.container}`;
    const lastHead = lastHeadBySource.get(source);
    const explicit = entry.levelSource === "structured" || entry.levelSource === "header";
    const closesTraceback = openTraceback.has(source) && PYTHON_EXCEPTION_LINE_RE.test(entry.content);
    const continues = isIndented(entry.content) || (!explicit && (closesTraceback || looksLikeUnindentedFrame(entry.content)));
    if (lastHead !== undefined && continues) {
      headOf[i] = lastHead;
      effectiveLevel[i] = effectiveLevel[lastHead];
      if (closesTraceback) openTraceback.delete(source);
    } else {
      headOf[i] = i;
      effectiveLevel[i] = entry.level;
      lastHeadBySource.set(source, i);
      if (entry.content.startsWith(PYTHON_TRACEBACK_HEAD)) openTraceback.add(source);
      else openTraceback.delete(source);
    }
  }
  return { headOf, effectiveLevel };
}

export interface LogGroup<T extends { id: number }> {
  head: T;
  continuations: T[];
}

/**
 * Fold visible lines into records using `headIdById` (continuation id → id of
 * the record's first line). A line whose record start is not visible keeps its
 * own row rather than attaching to an unrelated neighbour.
 */
export function groupContinuations<T extends { id: number }>(
  visible: readonly T[],
  headIdById: ReadonlyMap<number, number>,
): LogGroup<T>[] {
  const groups: LogGroup<T>[] = [];
  const groupByHeadId = new Map<number, LogGroup<T>>();
  for (const entry of visible) {
    const headId = headIdById.get(entry.id);
    const headGroup = headId !== undefined ? groupByHeadId.get(headId) : undefined;
    if (headGroup) {
      headGroup.continuations.push(entry);
    } else {
      const group: LogGroup<T> = { head: entry, continuations: [] };
      groups.push(group);
      groupByHeadId.set(entry.id, group);
    }
  }
  return groups;
}
