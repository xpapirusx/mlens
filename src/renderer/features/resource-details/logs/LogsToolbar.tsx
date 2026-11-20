import {
  ArrowDownToLine,
  Braces,
  CaseSensitive,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  EyeOff,
  Filter as FilterIcon,
  Highlighter,
  ListCollapse,
  Palette,
  Pause,
  Play,
  RefreshCw,
  Regex,
  Search,
  Trash2,
  WrapText,
  X,
} from "lucide-react";
import { cn } from "../../../lib/cn";
import { Menu } from "../../../design-system/components/Menu";
import { LOG_PALETTE } from "./log-palette";
import type { LogLevel } from "./log-types";
import { TIMESTAMP_FORMAT_LABELS, type TimestampFormat } from "./log-format";
import type { LogSearchMode } from "./use-log-search";

export type StructuredMode = "compact" | "expanded" | "raw";

const STRUCTURED_MODE_LABELS: Record<StructuredMode, string> = {
  compact: "Compact",
  expanded: "Expanded",
  raw: "Raw",
};

const STRUCTURED_MODE_DESCRIPTIONS: Record<StructuredMode, string> = {
  compact: "Summary line with field count",
  expanded: "All fields shown as a tree",
  raw: "Original log line, unparsed",
};

const TIMESTAMP_SHORT_LABELS: Record<TimestampFormat, string> = {
  "time-local": "Local time",
  "time-utc": "UTC time",
  "iso-local": "Full date",
  "iso-utc": "UTC date",
  relative: "Relative",
  epoch: "Unix time",
};

const TIMESTAMP_FORMATS: TimestampFormat[] = ["time-local", "time-utc", "iso-local", "iso-utc", "relative", "epoch"];

const LEVEL_OPTIONS: Array<{ level: LogLevel; label: string; noun: string }> = [
  { level: "error", label: "ERR", noun: "error logs" },
  { level: "warn", label: "WARN", noun: "warning logs" },
  { level: "info", label: "INFO", noun: "info logs" },
  { level: "debug", label: "DBG", noun: "debug logs" },
  { level: "unknown", label: "OTHER", noun: "lines with no level" },
];

const PALETTE = LOG_PALETTE;

const BUTTON_INACTIVE = `rounded p-1.5 transition-colors ${PALETTE.textSecondary} ${PALETTE.hoverText} ${PALETTE.hoverBg}`;
const BUTTON_INACTIVE_TERTIARY = `rounded p-1.5 transition-colors ${PALETTE.textTertiary} ${PALETTE.hoverText} ${PALETTE.hoverBg}`;
const SELECT_CLASS = `h-6 rounded border ${PALETTE.borderLight} ${PALETTE.elevatedBg} px-1 text-[calc(10px*var(--font-scale))] ${PALETTE.textSecondary} focus:outline-none disabled:opacity-40`;

export interface LogsToolbarProps {
  containers: string[];
  initContainers: string[];
  container: string;
  onContainerChange: (container: string) => void;
  tailLines: number;
  onTailLinesChange: (lines: number) => void;
  follow: boolean;
  onToggleFollow: () => void;
  previous: boolean;
  onTogglePrevious: () => void;
  levelCounts: Record<LogLevel, number>;
  enabledLevels: Set<LogLevel>;
  onToggleLevel: (level: LogLevel) => void;
  hasStructuredEntries: boolean;
  structuredMode: StructuredMode;
  onCycleStructuredMode: () => void;
  onPickStructuredMode: (mode: StructuredMode) => void;
  showTimestamps: boolean;
  onToggleTimestamps: () => void;
  tsFormat: TimestampFormat;
  onPickTimestampFormat: (format: TimestampFormat) => void;
  collapseStacks: boolean;
  onToggleCollapseStacks: () => void;
  ansiEnabled: boolean;
  onToggleAnsi: () => void;
  wordWrap: boolean;
  onToggleWrap: () => void;
  searchOpen: boolean;
  onToggleSearch: () => void;
  lineCount: number;
  bufferedLineCount: number;
  onReconnect: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onClear: () => void;
}

export function LogsToolbar(props: LogsToolbarProps) {
  const {
    containers, container, onContainerChange,
    initContainers,
    tailLines, onTailLinesChange,
    follow, onToggleFollow,
    previous, onTogglePrevious,
    levelCounts, enabledLevels, onToggleLevel,
    hasStructuredEntries, structuredMode, onCycleStructuredMode, onPickStructuredMode,
    showTimestamps, onToggleTimestamps, tsFormat, onPickTimestampFormat,
    collapseStacks, onToggleCollapseStacks,
    ansiEnabled, onToggleAnsi,
    wordWrap, onToggleWrap,
    searchOpen, onToggleSearch,
    lineCount, bufferedLineCount, onReconnect, onCopy, onDownload, onClear,
  } = props;

  return (
    <div className={`flex flex-wrap items-center gap-1.5 border-b px-2 py-1.5 ${PALETTE.border} ${PALETTE.toolbarBg}`}>
      <select
        value={container}
        onChange={(event) => onContainerChange(event.target.value)}
        className={`h-6 max-w-[13rem] rounded border ${PALETTE.borderLight} ${PALETTE.elevatedBg} px-1.5 text-[calc(11px*var(--font-scale))] ${PALETTE.textSecondary} focus:outline-none`}
        title="Container"
      >
        {containers.map((name) => (
          <option key={name} value={name} className="bg-slate-900">
            {name}
          </option>
        ))}
        {initContainers.map((name) => (
          <option key={`init:${name}`} value={name} className="bg-slate-900">
            {name} (init)
          </option>
        ))}
      </select>

      <select
        value={tailLines}
        onChange={(event) => onTailLinesChange(Number(event.target.value))}
        className={SELECT_CLASS}
        title="How many trailing lines to load"
      >
        {[200, 500, 1000, 5000].map((value) => (
          <option key={value} value={value} className="bg-slate-900">
            {value} lines
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={onToggleFollow}
        title={follow ? "Stop following new lines" : "Follow new lines"}
        className={cn(
          "flex h-6 items-center gap-1 rounded border px-1.5 text-[calc(10px*var(--font-scale))] transition-colors",
          follow
            ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
            : `${PALETTE.borderLight} ${PALETTE.elevatedBg} ${PALETTE.textSecondary} ${PALETTE.hoverText}`,
        )}
      >
        {follow ? <Pause className="h-2.5 w-2.5" /> : <Play className="h-2.5 w-2.5" />}
        Follow
      </button>

      <button
        type="button"
        onClick={onTogglePrevious}
        title="Logs from the pod's previous instance; stops following"
        className={cn(
          "flex h-6 items-center gap-1 rounded border px-1.5 text-[calc(10px*var(--font-scale))] transition-colors disabled:opacity-40",
          previous
            ? `${PALETTE.borderLight} bg-slate-700 text-slate-200`
            : `${PALETTE.borderLight} ${PALETTE.elevatedBg} ${PALETTE.textSecondary} ${PALETTE.hoverText}`,
        )}
      >
        Previous
      </button>

      <div className="ml-1 flex flex-wrap items-center gap-1" role="group" aria-label="Level filters">
        {LEVEL_OPTIONS.map(({ level, label, noun }) => {
          const active = enabledLevels.has(level);
          const count = levelCounts[level];
          return (
            <button
              key={level}
              type="button"
              onClick={() => onToggleLevel(level)}
              title={`${active ? "Hide" : "Show"} ${noun}`}
              className={cn(
                "whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                active ? levelActiveColor(level) : "border-transparent text-slate-600 hover:text-slate-500",
              )}
            >
              {label}
              {count > 0 ? ` ${count}` : ""}
            </button>
          );
        })}
      </div>

      <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-1">
        {hasStructuredEntries ? (
          <div className="flex items-center">
            <button
              type="button"
              onClick={onCycleStructuredMode}
              title={`Structured logs: ${STRUCTURED_MODE_LABELS[structuredMode]} — ${STRUCTURED_MODE_DESCRIPTIONS[structuredMode]} (click to cycle)`}
              aria-label={`Structured log display mode: ${STRUCTURED_MODE_LABELS[structuredMode]}`}
              className={cn("rounded-l p-1.5 transition-colors", structuredMode === "compact" ? BUTTON_INACTIVE : PALETTE.toolbarActive)}
            >
              <Braces className="h-4 w-4" />
            </button>
            <Menu
              align="end"
              width={230}
              className="border-slate-700! bg-slate-900!"
              trigger={({ toggle }) => (
                <button
                  type="button"
                  onClick={toggle}
                  title="Pick structured log display mode"
                  className={cn(
                    "rounded-r px-1.5 py-1.5 text-[10px] font-medium transition-colors",
                    structuredMode === "compact" ? BUTTON_INACTIVE_TERTIARY : PALETTE.toolbarActive,
                  )}
                >
                  {STRUCTURED_MODE_LABELS[structuredMode]}
                  <ChevronDown className="ml-0.5 inline h-3 w-3" />
                </button>
              )}
            >
              {({ close }) => (
                <div className="text-slate-200">
                  <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-slate-500">Structured display</div>
                  {(["compact", "expanded", "raw"] as StructuredMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        onPickStructuredMode(mode);
                        close();
                      }}
                      className="flex w-full items-start justify-between gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-slate-800"
                    >
                      <span className="flex flex-col">
                        <span>{STRUCTURED_MODE_LABELS[mode]}</span>
                        <span className="text-[10px] text-slate-500">{STRUCTURED_MODE_DESCRIPTIONS[mode]}</span>
                      </span>
                      {structuredMode === mode ? <span className="mt-0.5 text-[10px] text-blue-400">✓</span> : null}
                    </button>
                  ))}
                </div>
              )}
            </Menu>
          </div>
        ) : null}

        <div className="flex items-center">
          <button
            type="button"
            onClick={onToggleTimestamps}
            title={showTimestamps ? "Hide timestamps" : "Show timestamps"}
            className={cn("rounded-l p-1.5 transition-colors", showTimestamps ? PALETTE.toolbarActive : BUTTON_INACTIVE)}
          >
            <Clock className="h-4 w-4" />
          </button>
          <Menu
            align="end"
            width={190}
            className="border-slate-700! bg-slate-900!"
            trigger={({ toggle }) => (
              <button
                type="button"
                onClick={toggle}
                title={`Timestamp format: ${TIMESTAMP_FORMAT_LABELS[tsFormat]}`}
                aria-label="Pick timestamp format"
                className={cn(
                  "rounded-r px-1.5 py-1.5 text-[10px] font-medium transition-colors",
                  showTimestamps ? PALETTE.toolbarActive : BUTTON_INACTIVE_TERTIARY,
                )}
              >
                {TIMESTAMP_SHORT_LABELS[tsFormat]}
                <ChevronDown className="ml-0.5 inline h-3 w-3" />
              </button>
            )}
          >
            {({ close }) => (
              <div className="text-slate-200">
                <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-slate-500">Timestamp format</div>
                {TIMESTAMP_FORMATS.map((format) => (
                  <button
                    key={format}
                    type="button"
                    onClick={() => {
                      onPickTimestampFormat(format);
                      close();
                    }}
                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-slate-800"
                  >
                    <span>{TIMESTAMP_FORMAT_LABELS[format]}</span>
                    {tsFormat === format ? <span className="text-[10px] text-blue-400">✓</span> : null}
                  </button>
                ))}
              </div>
            )}
          </Menu>
        </div>

        <ToolbarButton
          active={collapseStacks}
          onClick={onToggleCollapseStacks}
          title={collapseStacks ? "Stop grouping stack traces" : "Group stack-trace lines"}
        >
          <ListCollapse className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton active={ansiEnabled} onClick={onToggleAnsi} title={ansiEnabled ? "Hide ANSI colours" : "Render ANSI colours"}>
          <Palette className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton active={wordWrap} onClick={onToggleWrap} title={wordWrap ? "Disable word wrap" : "Enable word wrap"}>
          <WrapText className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton active={searchOpen} onClick={onToggleSearch} title="Search (Ctrl+F)" ariaLabel="Search logs">
          <Search className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton onClick={onReconnect} title="Reconnect the log stream" ariaLabel="Reconnect logs">
          <RefreshCw className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton onClick={onCopy} title="Copy the lines currently shown" disabled={lineCount === 0} ariaLabel="Copy logs">
          <Copy className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton onClick={onDownload} title="Download the lines currently shown" disabled={lineCount === 0} ariaLabel="Download logs">
          <ArrowDownToLine className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton onClick={onClear} title="Clear logs" disabled={bufferedLineCount === 0} ariaLabel="Clear logs">
          <Trash2 className="h-4 w-4" />
        </ToolbarButton>
      </div>
    </div>
  );
}

function levelActiveColor(level: LogLevel): string {
  switch (level) {
    case "error":
      return PALETTE.levelActiveError;
    case "warn":
      return PALETTE.levelActiveWarn;
    case "info":
      return PALETTE.levelActiveInfo;
    case "debug":
      return PALETTE.levelActiveDebug;
    default:
      return PALETTE.levelActiveOther;
  }
}

function ToolbarButton({
  active,
  onClick,
  title,
  disabled,
  ariaLabel,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  ariaLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel ?? title}
      disabled={disabled}
      className={cn(
        "rounded p-1.5 transition-colors disabled:opacity-40",
        active ? PALETTE.toolbarActive : `${BUTTON_INACTIVE}`,
      )}
    >
      {children}
    </button>
  );
}

const SEARCH_MODES: Array<{ mode: LogSearchMode; label: string; tip: string; Icon: typeof FilterIcon }> = [
  { mode: "highlight", label: "Highlight", tip: "Show all lines and highlight matches", Icon: Highlighter },
  { mode: "only", label: "Only matching", tip: "Show only matching lines, with their stack traces", Icon: FilterIcon },
  { mode: "hide", label: "Hide matching", tip: "Hide matching lines and their stack traces, like grep -v", Icon: EyeOff },
];

export interface LogsSearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  isRegex: boolean;
  onToggleRegex: () => void;
  isCaseSensitive: boolean;
  onToggleCaseSensitive: () => void;
  mode: LogSearchMode;
  onModeChange: (mode: LogSearchMode) => void;
  regexError: string | null;
  matchCount: number;
  currentMatch: number;
  hiddenCount: number;
  modeIsHide: boolean;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

export function LogsSearchBar(props: LogsSearchBarProps) {
  const {
    query, onQueryChange, isRegex, onToggleRegex, isCaseSensitive, onToggleCaseSensitive,
    mode, onModeChange, regexError, matchCount, currentMatch, hiddenCount, modeIsHide,
    onNext, onPrev, onClose,
  } = props;

  return (
    <div className={`flex flex-wrap items-center gap-2 border-b px-2 py-1.5 ${PALETTE.border} ${PALETTE.toolbarBgMuted}`}>
      <Search className={`h-3.5 w-3.5 shrink-0 ${PALETTE.textSecondary}`} />
      <input
        autoFocus
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
          else if (event.key === "Enter") {
            if (event.shiftKey) onPrev();
            else onNext();
          }
        }}
        placeholder="Search logs…"
        className={`min-w-0 flex-1 basis-[calc(100%-2rem)] bg-transparent text-[calc(12px*var(--font-scale))] ${PALETTE.textPrimary} placeholder:text-slate-600 focus:outline-none`}
      />

      <button
        type="button"
        onClick={onToggleRegex}
        title="Regex"
        className={cn("rounded p-1 transition-colors", isRegex ? PALETTE.toolbarActive : `${PALETTE.textTertiary} ${PALETTE.hoverText}`)}
      >
        <Regex className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onToggleCaseSensitive}
        title="Match case"
        className={cn(
          "rounded p-1 transition-colors",
          isCaseSensitive ? PALETTE.toolbarActive : `${PALETTE.textTertiary} ${PALETTE.hoverText}`,
        )}
      >
        <CaseSensitive className="h-3.5 w-3.5" />
      </button>

      <div className={`flex shrink-0 items-center rounded border ${PALETTE.border}`} role="radiogroup" aria-label="Search mode">
        {SEARCH_MODES.map(({ mode: option, label, tip, Icon }) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={mode === option}
            aria-label={label}
            title={tip}
            onClick={() => onModeChange(option)}
            className={cn(
              "flex items-center gap-1 whitespace-nowrap px-1.5 py-0.5 text-[11px] transition-colors",
              mode === option ? PALETTE.toolbarActive : `${PALETTE.textTertiary} ${PALETTE.hoverText}`,
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">{label}</span>
          </button>
        ))}
      </div>

      {query ? (
        <>
          <span className={cn("whitespace-nowrap text-xs", regexError ? PALETTE.textError : PALETTE.textTertiary)}>
            {regexError
              ? "Invalid regex"
              : modeIsHide
                ? `${hiddenCount} hidden`
                : matchCount > 0
                  ? `${currentMatch + 1} / ${matchCount}`
                  : "0 results"}
          </span>
          {!modeIsHide ? (
            <>
              <button
                type="button"
                onClick={onPrev}
                disabled={matchCount === 0}
                title="Previous (Shift+Enter)"
                className={`rounded p-1 ${PALETTE.textSecondary} ${PALETTE.hoverText} disabled:opacity-30`}
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onNext}
                disabled={matchCount === 0}
                title="Next (Enter)"
                className={`rounded p-1 ${PALETTE.textSecondary} ${PALETTE.hoverText} disabled:opacity-30`}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => onQueryChange("")}
            title="Clear search"
            className={`rounded p-1 ${PALETTE.textSecondary} ${PALETTE.hoverText}`}
          >
            <X className="h-3 w-3" />
          </button>
        </>
      ) : null}
    </div>
  );
}
