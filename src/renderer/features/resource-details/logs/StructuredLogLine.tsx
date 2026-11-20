import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Filter } from "lucide-react";
import { parseLogfmt, tokenizeJson, unescapeJsonStrings } from "./log-format";
import { selectLevelField, selectPostgresRecord } from "./log-level";
import { LOG_PALETTE, getLogLevelColor, type LogPalette } from "./log-palette";
import type { LogLevel } from "./log-types";

interface StructuredLogLineProps {
  content: string;
  level: LogLevel;
  wordWrap: boolean;
  isLogfmt?: boolean;
  defaultExpanded?: boolean;
  /** Expanded field values become click-to-filter chips when this is set. */
  onFilterValue?: (value: string) => void;
}

/**
 * JSON and logfmt records render as a readable summary (level badge, message,
 * error, caller, field count) and can expand into a syntax-coloured tree with
 * click-to-filter values — Radar's structured log line.
 */
export function StructuredLogLine({
  content,
  level,
  wordWrap,
  isLogfmt,
  defaultExpanded,
  onFilterValue,
}: StructuredLogLineProps) {
  const palette = LOG_PALETTE;
  // null = user hasn't toggled this line; defer to the global structured mode.
  const [localExpanded, setLocalExpanded] = useState<boolean | null>(null);
  const expanded = localExpanded ?? defaultExpanded ?? false;

  const parsed = useMemo(() => {
    try {
      return isLogfmt ? parseLogfmt(content) : (JSON.parse(content.trim()) as Record<string, unknown>);
    } catch {
      return null;
    }
  }, [content, isLogfmt]);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return (
      <span className={`${wordWrap ? "whitespace-pre-wrap [overflow-wrap:anywhere]" : "whitespace-pre"} ${getLogLevelColor(level)}`}>
        {content}
      </span>
    );
  }

  const fieldCount = Object.keys(parsed).length;
  const toggle = () => setLocalExpanded(!expanded);
  const chevron = expanded ? (
    <ChevronDown className={`h-3 w-3 shrink-0 ${palette.textTertiary}`} />
  ) : (
    <ChevronRight className={`h-3 w-3 shrink-0 ${palette.textTertiary}`} />
  );
  const summary = <SummaryLine obj={parsed} level={level} line={content} palette={palette} />;
  const fieldChip = <span className={`${palette.textTertiary} ml-1 inline-block whitespace-nowrap`}>{`{${fieldCount} fields}`}</span>;

  return (
    <span>
      <span
        onClick={toggle}
        className={`cursor-pointer rounded px-0.5 -ml-0.5 ${palette.hoverSurface} ${
          wordWrap ? "whitespace-pre-wrap [overflow-wrap:anywhere]" : "whitespace-pre"
        }`}
      >
        <span className="mr-0.5 inline-flex items-center align-middle">{chevron}</span>
        {summary}
        {fieldChip}
      </span>
      {expanded ? (
        <span className={`ml-4 block ${wordWrap ? "whitespace-pre-wrap [overflow-wrap:anywhere]" : "whitespace-pre"}`}>
          {isLogfmt ? (
            <ExpandedLogfmt obj={parsed} onFilterValue={onFilterValue} palette={palette} />
          ) : (
            <JsonExpanded
              text={unescapeJsonStrings(JSON.stringify(parsed, null, 2))}
              onFilterValue={onFilterValue}
              palette={palette}
            />
          )}
        </span>
      ) : null}
    </span>
  );
}

function FilterableValue({
  value,
  onFilter,
  color,
  palette,
}: {
  value: string;
  onFilter?: (value: string) => void;
  color?: string;
  palette: LogPalette;
}) {
  if (!onFilter) return <span style={color ? { color } : undefined}>{value}</span>;
  return (
    <span className={`group/flt inline-flex items-baseline gap-0.5 rounded align-baseline ${palette.hoverSurface}`}>
      <span style={color ? { color } : undefined}>{value}</span>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onFilter(value);
        }}
        className={`px-0.5 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/flt:opacity-100 ${palette.textTertiary} ${palette.hoverText}`}
        title={`Filter to lines containing "${value}"`}
        aria-label={`Filter to lines containing ${value}`}
      >
        <Filter className="inline h-3 w-3" />
      </button>
    </span>
  );
}

/** Pretty-printed JSON with filterable primitive values, preserving layout. */
function JsonExpanded({
  text,
  onFilterValue,
  palette,
}: {
  text: string;
  onFilterValue?: (value: string) => void;
  palette: LogPalette;
}) {
  const nodes: ReactNode[] = [];
  let idx = 0;
  for (const { type, value } of tokenizeJson(text)) {
    if (type === "key") {
      nodes.push(
        <span key={`k${idx++}`} style={{ color: palette.syntaxKey }}>
          {value}
        </span>,
      );
      nodes.push(<span key={`c${idx++}`}>:</span>);
    } else if (type === "string") {
      const inner = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      nodes.push(
        <FilterableValue
          key={`s${idx++}`}
          value={inner}
          onFilter={onFilterValue}
          color={palette.syntaxString}
          palette={palette}
        />,
      );
    } else if (type === "number" || type === "boolean") {
      nodes.push(
        <FilterableValue
          key={`${type[0]}${idx++}`}
          value={value}
          onFilter={onFilterValue}
          color={type === "number" ? palette.syntaxNumber : palette.syntaxBoolean}
          palette={palette}
        />,
      );
    } else if (type === "null") {
      nodes.push(
        <span key={`z${idx++}`} style={{ color: palette.syntaxNull }}>
          {value}
        </span>,
      );
    } else {
      nodes.push(<span key={`t${idx++}`}>{value}</span>);
    }
  }
  return <>{nodes}</>;
}

function SummaryLine({
  obj,
  level,
  palette,
  line,
}: {
  obj: Record<string, unknown>;
  level: LogLevel;
  palette: LogPalette;
  line: string;
}) {
  const rawLevel = selectLevelField(obj)?.raw;
  const pgRecord = selectPostgresRecord(obj);
  const msg = pgRecord?.record.message ?? obj.msg ?? obj.message;
  const rawErr = obj.error ?? obj.err;
  const err =
    typeof rawErr === "string"
      ? rawErr
      : (nestedField(obj, "error", "message") ?? nestedField(obj, "err", "message"));
  const caller = obj.caller ?? obj.source;
  const nonBlank = (value: unknown) => typeof value === "string" && value.trim() !== "";
  const hasSummary = nonBlank(msg) || nonBlank(err) || nonBlank(caller);

  return (
    <>
      {rawLevel != null ? (
        <span className={`${levelBadgeColor(level, palette)} mr-1.5 inline-block rounded px-1 py-px text-[10px] font-semibold`}>
          {formatLevel(rawLevel, level)}
        </span>
      ) : null}
      {typeof msg === "string" ? <span className={palette.textPrimary}>{msg}</span> : null}
      {typeof err === "string" ? <span className={`${palette.textError} ml-2`}>error={err}</span> : null}
      {typeof caller === "string" ? <span className={`${palette.textDisabled} ml-2`}>{caller}</span> : null}
      {!hasSummary ? <span className={palette.textPrimary}>{line.trim()}</span> : null}
    </>
  );
}

function ExpandedLogfmt({
  obj,
  onFilterValue,
  palette,
}: {
  obj: Record<string, unknown>;
  onFilterValue?: (value: string) => void;
  palette: LogPalette;
}) {
  return (
    <>
      {Object.entries(obj).map(([key, val]) => (
        <div key={key}>
          <span style={{ color: palette.syntaxKey }}>{key}</span>
          <span className={palette.textTertiary}>=</span>
          <FilterableValue value={String(val)} onFilter={onFilterValue} color={palette.syntaxString} palette={palette} />
        </div>
      ))}
    </>
  );
}

function nestedField(obj: Record<string, unknown>, parent: string, child: string): unknown {
  const value = obj[parent];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return (value as Record<string, unknown>)[child];
  }
  return undefined;
}

const NUMERIC_LEVEL_LABELS: Record<LogLevel, string> = { error: "ERR", warn: "WARN", info: "INFO", debug: "DBG", unknown: "?" };

function formatLevel(level: unknown, resolved: LogLevel): string {
  if (typeof level === "number") return NUMERIC_LEVEL_LABELS[resolved];
  return String(level).toUpperCase();
}

function levelBadgeColor(level: LogLevel, palette: LogPalette): string {
  switch (level) {
    case "error":
      return palette.levelBadgeError;
    case "warn":
      return palette.levelBadgeWarn;
    case "info":
      return palette.levelBadgeInfo;
    case "debug":
      return palette.levelBadgeDebug;
    default:
      return palette.levelBadgeNeutral;
  }
}
