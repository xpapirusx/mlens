import { ChevronDown, ChevronRight, Copy } from "lucide-react";
import { cn } from "../../../lib/cn";
import { StructuredLogLine } from "./StructuredLogLine";
import { ansiToHtml, formatLogTimestamp, highlightSearchMatches, stripAnsi, type TimestampFormat } from "./log-format";
import { getLogLevelColor, LOG_PALETTE } from "./log-palette";
import type { LogGroup } from "./log-level";
import type { LogEntry } from "./log-types";

const PALETTE = LOG_PALETTE;

export interface LogLineProps {
  entry: LogEntry;
  searchQuery: string;
  searchIsRegex: boolean;
  searchIsCaseSensitive: boolean;
  showTimestamp: boolean;
  tsFormat: TimestampFormat;
  ansiEnabled: boolean;
  isCurrentMatch: boolean;
  wordWrap: boolean;
  defaultExpanded: boolean;
  rawStructured: boolean;
  onFilterValue?: (value: string) => void;
  leadSlot?: React.ReactNode;
}

function LogLine(props: LogLineProps) {
  const {
    entry, searchQuery, searchIsRegex, searchIsCaseSensitive, showTimestamp, tsFormat,
    ansiEnabled, isCurrentMatch, wordWrap, defaultExpanded, rawStructured, onFilterValue, leadSlot,
  } = props;
  const levelColor = getLogLevelColor(entry.level);
  const wrapClass = wordWrap ? "whitespace-pre-wrap [overflow-wrap:anywhere]" : "whitespace-pre";

  let content: React.ReactNode;
  if (searchQuery) {
    const plain = stripAnsi(entry.content);
    const highlighted = highlightSearchMatches(plain, searchQuery, searchIsRegex, searchIsCaseSensitive);
    content = <span className={`${wrapClass} ${levelColor}`} dangerouslySetInnerHTML={{ __html: highlighted }} />;
  } else if ((entry.isJson || entry.isLogfmt) && !rawStructured) {
    content = (
      <StructuredLogLine
        content={entry.content}
        level={entry.level}
        wordWrap={wordWrap}
        isLogfmt={entry.isLogfmt}
        defaultExpanded={defaultExpanded}
        onFilterValue={onFilterValue}
      />
    );
  } else if (ansiEnabled) {
    content = (
      <span className={`${wrapClass} ${levelColor}`} dangerouslySetInnerHTML={{ __html: ansiToHtml(entry.content) }} />
    );
  } else {
    content = <span className={`${wrapClass} ${levelColor}`}>{stripAnsi(entry.content)}</span>;
  }

  return (
    <div className={cn("group flex px-2 leading-5", PALETTE.hoverSurface, isCurrentMatch && PALETTE.currentMatchBg)}>
      {leadSlot}
      {showTimestamp && entry.timestamp ? (
        <span className={`${PALETTE.textTertiary} shrink-0 select-none whitespace-nowrap pr-2`} title={entry.timestamp}>
          {formatLogTimestamp(entry.timestamp, tsFormat)}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">{content}</span>
      <button
        type="button"
        onClick={() => void navigator.clipboard.writeText(stripAnsi(entry.content))}
        className={cn(
          "ml-1 shrink-0 rounded p-0.5 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100",
          PALETTE.textTertiary,
          PALETTE.hoverText,
        )}
        title="Copy line"
        aria-label="Copy log line"
      >
        <Copy className="h-3 w-3" />
      </button>
    </div>
  );
}

export interface LogGroupItemProps extends Omit<LogLineProps, "entry" | "leadSlot" | "isCurrentMatch"> {
  group: LogGroup<LogEntry>;
  isCurrentMatch: boolean;
  isStackExpanded: boolean;
  onToggleStack: (id: number) => void;
}

export function LogGroupItem(props: LogGroupItemProps) {
  const { group, isStackExpanded, onToggleStack, ...rest } = props;
  const hasStack = group.continuations.length > 0;

  const stackToggle = hasStack ? (
    <button
      type="button"
      onClick={() => onToggleStack(group.head.id)}
      className={cn("mr-1 shrink-0 self-start rounded p-0.5", PALETTE.textTertiary, PALETTE.hoverText, PALETTE.hoverSurface)}
      title={isStackExpanded ? "Collapse stack trace" : `Expand ${group.continuations.length} stack frames`}
    >
      {isStackExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
    </button>
  ) : null;

  return (
    <div>
      <LogLine entry={group.head} {...rest} leadSlot={stackToggle} />
      {hasStack && !isStackExpanded ? (
        <button
          type="button"
          onClick={() => onToggleStack(group.head.id)}
          className={cn(
            "block w-full py-0 pl-6 pr-2 text-left text-[10px]",
            PALETTE.textTertiary,
            PALETTE.hoverText,
            PALETTE.hoverSurface,
          )}
        >
          [+{group.continuations.length} stack {group.continuations.length === 1 ? "line" : "lines"}]
        </button>
      ) : null}
      {hasStack && isStackExpanded
        ? group.continuations.map((continuation) => (
            <div key={continuation.id} className="pl-4">
              <LogLine entry={continuation} {...rest} isCurrentMatch={false} />
            </div>
          ))
        : null}
    </div>
  );
}
