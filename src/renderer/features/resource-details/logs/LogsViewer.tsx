import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Terminal } from "lucide-react";
import { api, errorText } from "../../../lib/api";
import { toast } from "../../../design-system/components/Toast";
import { Spinner } from "../../../design-system/components/Spinner";
import { cn } from "../../../lib/cn";
import { LogGroupItem } from "./LogLine";
import { LogsSearchBar, LogsToolbar, type StructuredMode } from "./LogsToolbar";
import { LOG_PALETTE } from "./log-palette";
import { parseLogLine, stripAnsi } from "./log-format";
import { associateContinuations, groupContinuations } from "./log-level";
import type { LogLevel } from "./log-types";
import { useLogBuffer } from "./use-log-buffer";
import { useLogSearch } from "./use-log-search";

const MAX_PARTIAL_LINE = 100_000;
const FLUSH_MS = 160;
const TS_FORMATS = ["time-local", "time-utc", "iso-local", "iso-utc", "relative", "epoch"] as const;
type TimestampFormat = (typeof TS_FORMATS)[number];

const ALL_LEVELS: LogLevel[] = ["error", "warn", "info", "debug", "unknown"];

function storedBoolean(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    if (value === "true") return true;
    if (value === "false") return false;
  } catch {
    // localStorage can be unavailable; fall through to the default.
  }
  return fallback;
}

function storedString<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key) as T | null;
    if (value && allowed.includes(value)) return value;
  } catch {
    // ignore
  }
  return fallback;
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

/**
 * The pod log surface: Radar's viewer on mLens' streaming IPC. Lines are parsed
 * into records (timestamp, content, severity), filtered by level, searched with
 * literal/regex and only/hide modes, and rendered with ANSI colours, structured
 * JSON/logfmt summaries, stack-trace grouping and selectable timestamps.
 */
export function LogsViewer({
  clusterId,
  namespace,
  pod,
  containers,
  initContainers = [],
}: {
  clusterId: string;
  namespace: string;
  pod: string;
  containers: string[];
  initContainers?: string[];
}) {
  const containerOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const name of [...containers, ...initContainers]) {
      if (!name || seen.has(name)) continue;
      seen.add(name);
      list.push(name);
    }
    return list;
  }, [containers, initContainers]);

  const [container, setContainer] = useState(containerOptions[0] ?? "");
  const [follow, setFollow] = useState(true);
  const [previous, setPrevious] = useState(false);
  const [tailLines, setTailLines] = useState(500);
  const [connection, setConnection] = useState<"connecting" | "streaming" | "ended" | "error">("connecting");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const [showTimestamps, setShowTimestamps] = useState(() => storedBoolean("mlens-logs-timestamps", true));
  const [tsFormat, setTsFormat] = useState<TimestampFormat>(() =>
    storedString("mlens-logs-ts-format", TS_FORMATS, "time-local"),
  );
  const [ansiEnabled, setAnsiEnabled] = useState(() => storedBoolean("mlens-logs-ansi", true));
  const [wordWrap, setWordWrap] = useState(() => storedBoolean("mlens-logs-wrap", true));
  const [collapseStacks, setCollapseStacks] = useState(() => storedBoolean("mlens-logs-collapse-stacks", true));
  const [structuredMode, setStructuredMode] = useState<StructuredMode>(() =>
    storedString("mlens-logs-structured-mode", ["compact", "expanded", "raw"] as const, "compact"),
  );
  const [enabledLevels, setEnabledLevels] = useState<Set<LogLevel>>(() => new Set(ALL_LEVELS));
  const [expandedStacks, setExpandedStacks] = useState<Set<number>>(() => new Set());

  const buffer = useLogBuffer();
  const scrollRef = useRef<HTMLDivElement>(null);
  const textBufferRef = useRef("");
  const partialRef = useRef("");
  // Id of the newest line when the reader paused. New lines since then feed the
  // "Scroll to bottom · N new lines" pill even while the live buffer grows.
  const pausedAtRef = useRef<number | null>(null);
  const latestEntryIdRef = useRef(buffer.latestEntryId);
  latestEntryIdRef.current = buffer.latestEntryId;

  useEffect(() => {
    if (containerOptions.length === 0) return;
    setContainer((current) => (containerOptions.includes(current) ? current : containerOptions[0]));
  }, [containerOptions]);

  // Stream lifecycle. Timestamps are always requested so the Time toggle and
  // the format picker act on already-buffered lines without reopening a stream.
  useEffect(() => {
    if (!container) return;
    const streamId = `logs-${clusterId}-${namespace}-${pod}-${container}-${Date.now()}`;
    let disposed = false;

    buffer.clear();
    buffer.setFollowing(true);
    pausedAtRef.current = null;
    setStreamError(null);
    setConnection("connecting");
    setExpandedStacks(new Set());
    textBufferRef.current = "";
    partialRef.current = "";

    const drain = () => {
      const chunk = textBufferRef.current;
      if (!chunk) return;
      textBufferRef.current = "";
      setConnection("streaming");
      const data = partialRef.current + chunk;
      const cut = data.lastIndexOf("\n");
      let complete: string[];
      if (cut === -1) {
        // No newline yet: keep the tail, force-splitting a runaway line.
        if (data.length <= MAX_PARTIAL_LINE) {
          partialRef.current = data;
          return;
        }
        complete = [data.slice(0, MAX_PARTIAL_LINE)];
        partialRef.current = data.slice(MAX_PARTIAL_LINE);
      } else {
        partialRef.current = data.slice(cut + 1);
        complete = data.slice(0, cut).split("\n");
      }
      buffer.appendBatch(
        complete.map((line) => {
          const { timestamp, content } = parseLogLine(line);
          return { timestamp, content, container, pod };
        }),
      );
    };

    const offChunk = api.logs.onChunk((payload) => {
      if (payload.streamId !== streamId || disposed) return;
      textBufferRef.current += payload.chunk;
      if (textBufferRef.current.length > 1_500_000) drain();
    });

    const offEnd = api.logs.onEnd((payload) => {
      if (payload.streamId !== streamId || disposed) return;
      drain();
      if (partialRef.current) {
        const tail = partialRef.current;
        partialRef.current = "";
        const { timestamp, content } = parseLogLine(tail);
        buffer.appendBatch([{ timestamp, content, container, pod }]);
      }
      setConnection(payload.error ? "error" : "ended");
      if (payload.error) setStreamError(payload.error);
    });

    const flush = window.setInterval(() => {
      if (!disposed) drain();
    }, FLUSH_MS);

    void api.logs
      .start({
        streamId,
        clusterId,
        namespace,
        pod,
        container,
        follow,
        previous,
        tailLines,
        timestamps: true,
      })
      .catch((error) => {
        if (disposed) return;
        setConnection("error");
        setStreamError(errorText(error));
      });

    return () => {
      disposed = true;
      window.clearInterval(flush);
      offChunk();
      offEnd();
      void api.logs.stop(streamId).catch(() => undefined);
    };
    // buffer is a stable hook object; its functions are used through refs below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterId, namespace, pod, container, follow, previous, tailLines, nonce]);

  // Associate stack-trace continuations with their record so level filters and
  // grouping treat a trace as one line.
  const association = useMemo(() => {
    const { headOf, effectiveLevel } = associateContinuations(buffer.entries);
    const headIdById = new Map<number, number>();
    for (let i = 0; i < buffer.entries.length; i += 1) {
      if (headOf[i] !== i) headIdById.set(buffer.entries[i].id, buffer.entries[headOf[i]].id);
    }
    return { headOf, effectiveLevel, headIdById };
  }, [buffer.entries]);

  const recordEntries = useMemo(
    () =>
      buffer.entries.map((entry, index) =>
        association.effectiveLevel[index] === entry.level ? entry : { ...entry, level: association.effectiveLevel[index] },
      ),
    [buffer.entries, association],
  );

  const levelFilteredEntries = useMemo(() => {
    const allEnabled = ALL_LEVELS.every((level) => enabledLevels.has(level));
    if (allEnabled) return recordEntries;
    return recordEntries.filter((entry) => enabledLevels.has(entry.level));
  }, [recordEntries, enabledLevels]);

  const levelCounts = useMemo(() => {
    const counts: Record<LogLevel, number> = { error: 0, warn: 0, info: 0, debug: 0, unknown: 0 };
    let index = 0;
    for (const entry of buffer.entries) {
      // Count records only: a 40-frame stack trace is one error.
      if (association.headOf[index] === index) counts[entry.level] += 1;
      index += 1;
    }
    return counts;
  }, [buffer.entries, association]);

  const virtualizerRef = useRef<ReturnType<typeof useVirtualizer<HTMLDivElement, Element>> | null>(null);
  const scrollToIndex = useCallback((index: number) => {
    virtualizerRef.current?.scrollToIndex(index, { align: "center", behavior: "smooth" });
  }, []);

  const recordIdOf = useCallback(
    (entry: (typeof recordEntries)[number]) => {
      const headId = association.headIdById.get(entry.id);
      return headId ?? entry.id;
    },
    [association],
  );

  const setBufferFollowing = buffer.setFollowing;
  const pauseFollowing = useCallback(() => {
    if (pausedAtRef.current === null) pausedAtRef.current = latestEntryIdRef.current;
    setBufferFollowing(false);
  }, [setBufferFollowing]);
  const resumeFollowing = useCallback(() => {
    pausedAtRef.current = null;
    setBufferFollowing(true);
  }, [setBufferFollowing]);
  const search = useLogSearch(levelFilteredEntries, scrollToIndex, recordIdOf, pauseFollowing);

  const displayEntries = search.isFiltering ? search.filteredEntries : levelFilteredEntries;
  const hiddenCount = levelFilteredEntries.length - displayEntries.length;
  const hasStructuredEntries = useMemo(
    () => buffer.entries.some((entry) => entry.isJson || entry.isLogfmt),
    [buffer.entries],
  );
  const pendingLineCount =
    !buffer.isFollowing && pausedAtRef.current !== null
      ? Math.max(0, buffer.latestEntryId - pausedAtRef.current)
      : 0;

  // A new search query jumps to its first match once the deferred scan has run;
  // later appends do not yank the view while the reader inspects a match.
  const scrolledQueryRef = useRef("");
  useEffect(() => {
    if (!search.query) {
      scrolledQueryRef.current = "";
      return;
    }
    if (search.deferredQuery !== search.query) return;
    if (scrolledQueryRef.current === search.query || search.mode === "hide" || search.matchIndices.length === 0) return;
    scrolledQueryRef.current = search.query;
    pauseFollowing();
    const entry = levelFilteredEntries[search.matchIndices[0]];
    const index =
      search.mode === "only" ? search.filteredEntries.findIndex((candidate) => candidate.id === entry?.id) : search.matchIndices[0];
    if (index >= 0) window.requestAnimationFrame(() => scrollToIndex(index));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.query, search.deferredQuery, search.matchIndices, search.mode]);

  const groupedEntries = useMemo(() => {
    if (!collapseStacks || search.query) {
      return displayEntries.map((entry) => ({ head: entry, continuations: [] }));
    }
    return groupContinuations(displayEntries, association.headIdById);
  }, [displayEntries, collapseStacks, search.query, association]);

  const currentHighlightId =
    search.matchIndices.length === 0 || search.mode === "hide"
      ? -1
      : (levelFilteredEntries[search.matchIndices[search.currentMatch]]?.id ?? -1);

  const virtualizer = useVirtualizer({
    count: groupedEntries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 20,
    overscan: 20,
  });
  virtualizerRef.current = virtualizer;

  const isFollowingRef = useRef(buffer.isFollowing);
  isFollowingRef.current = buffer.isFollowing;

  // Pin new output to the bottom while following; a paused reader keeps their place.
  useLayoutEffect(() => {
    if (!buffer.isFollowing) return;
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    const frame = window.requestAnimationFrame(() => {
      const current = scrollRef.current;
      if (current && isFollowingRef.current) current.scrollTop = current.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [groupedEntries, buffer.isFollowing]);

  // Selecting log text pauses following, so the text a reader is dragging never
  // scrolls away under the pointer.
  useEffect(() => {
    const onSelectionChange = () => {
      const selection = document.getSelection();
      if (
        !isFollowingRef.current ||
        !selection ||
        selection.isCollapsed ||
        !selection.anchorNode ||
        !scrollRef.current?.contains(selection.anchorNode)
      ) {
        return;
      }
      pauseFollowing();
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [pauseFollowing]);

  // Ctrl/Cmd+F opens log search — except when typing elsewhere or inside xterm.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "f") return;
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest(".xterm")) return;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      event.preventDefault();
      search.open();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [search]);

  // "Relative" timestamps need a periodic tick to stay honest while idle.
  const [, setNowTick] = useState(0);
  useEffect(() => {
    if (tsFormat !== "relative" || !showTimestamps) return;
    const timer = window.setInterval(() => setNowTick((value) => value + 1), 15_000);
    return () => window.clearInterval(timer);
  }, [tsFormat, showTimestamps]);

  const visibleText = useCallback(
    () =>
      displayEntries
        .map((entry) => {
          const timestamp = showTimestamps && entry.timestamp ? `${entry.timestamp} ` : "";
          return `${timestamp}${stripAnsi(entry.content)}`;
        })
        .join("\n"),
    [displayEntries, showTimestamps],
  );

  const copyVisible = () => {
    const text = visibleText();
    void navigator.clipboard.writeText(text).then(
      () => toast.success(`Copied ${displayEntries.length} log line${displayEntries.length === 1 ? "" : "s"}`),
      () => toast.error("Cannot access the clipboard"),
    );
  };

  const downloadVisible = () => {
    const blob = new Blob([visibleText()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${namespace}_${pod}_${container}.log`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const toggleFollow = () => {
    // Following the current run and reading the previous instance are mutually
    // exclusive at the API level.
    if (!follow) setPrevious(false);
    setFollow(!follow);
  };

  const toggleLevel = (level: LogLevel) => {
    setEnabledLevels((current) => {
      const next = new Set(current);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  };

  const toggleStack = (id: number) => {
    setExpandedStacks((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const cycleStructuredMode = () => {
    const order: StructuredMode[] = ["compact", "expanded", "raw"];
    setStructuredMode((current) => {
      const next = order[(order.indexOf(current) + 1) % order.length];
      store("mlens-logs-structured-mode", next);
      return next;
    });
  };

  const pickStructuredMode = (mode: StructuredMode) => {
    setStructuredMode(mode);
    store("mlens-logs-structured-mode", mode);
  };

  const toggleTimestamps = () => {
    setShowTimestamps((current) => {
      store("mlens-logs-timestamps", String(!current));
      return !current;
    });
  };

  const pickTimestampFormat = (format: TimestampFormat) => {
    setTsFormat(format);
    setShowTimestamps(true);
    store("mlens-logs-ts-format", format);
    store("mlens-logs-timestamps", "true");
  };

  const toggleAnsi = () => {
    setAnsiEnabled((current) => {
      store("mlens-logs-ansi", String(!current));
      return !current;
    });
  };

  const toggleWrap = () => {
    setWordWrap((current) => {
      store("mlens-logs-wrap", String(!current));
      return !current;
    });
  };

  const toggleCollapseStacks = () => {
    setCollapseStacks((current) => {
      store("mlens-logs-collapse-stacks", String(!current));
      return !current;
    });
  };

  const filterByValue = (value: string) => {
    search.setQuery(value);
    search.setIsRegex(false);
    search.setMode("only");
    if (!search.isOpen) search.open();
  };

  const isLoading = connection === "connecting" && buffer.entries.length === 0;
  const showError = connection === "error" && buffer.entries.length === 0;

  return (
    <div className={cn("flex h-full min-h-0 flex-col", LOG_PALETTE.containerBg)}>
      <LogsToolbar
        containers={containers}
        initContainers={initContainers}
        container={container}
        onContainerChange={setContainer}
        tailLines={tailLines}
        onTailLinesChange={setTailLines}
        follow={follow}
        onToggleFollow={toggleFollow}
        previous={previous}
        onTogglePrevious={() => {
          setPrevious((value) => !value);
          // Previous is a snapshot of the previous container instance, so it
          // cannot be streamed together with the current run.
          setFollow(false);
        }}
        levelCounts={levelCounts}
        enabledLevels={enabledLevels}
        onToggleLevel={toggleLevel}
        hasStructuredEntries={hasStructuredEntries}
        structuredMode={structuredMode}
        onCycleStructuredMode={cycleStructuredMode}
        onPickStructuredMode={pickStructuredMode}
        showTimestamps={showTimestamps}
        onToggleTimestamps={toggleTimestamps}
        tsFormat={tsFormat}
        onPickTimestampFormat={pickTimestampFormat}
        collapseStacks={collapseStacks}
        onToggleCollapseStacks={toggleCollapseStacks}
        ansiEnabled={ansiEnabled}
        onToggleAnsi={toggleAnsi}
        wordWrap={wordWrap}
        onToggleWrap={toggleWrap}
        searchOpen={search.isOpen}
        onToggleSearch={() => (search.isOpen ? search.close() : search.open())}
        lineCount={displayEntries.length}
        bufferedLineCount={buffer.entries.length}
        onReconnect={() => setNonce((value) => value + 1)}
        onCopy={copyVisible}
        onDownload={downloadVisible}
        onClear={() => {
          buffer.clear();
          setExpandedStacks(new Set());
        }}
      />

      {search.isOpen ? (
        <LogsSearchBar
          query={search.query}
          onQueryChange={search.setQuery}
          isRegex={search.isRegex}
          onToggleRegex={search.toggleRegex}
          isCaseSensitive={search.isCaseSensitive}
          onToggleCaseSensitive={search.toggleCaseSensitive}
          mode={search.mode}
          onModeChange={search.setMode}
          regexError={search.regexError}
          matchCount={search.matchCount}
          currentMatch={search.currentMatch}
          hiddenCount={hiddenCount}
          modeIsHide={search.mode === "hide"}
          onNext={search.goToNext}
          onPrev={search.goToPrev}
          onClose={search.close}
        />
      ) : null}

      {isLoading ? (
        <div className={cn("flex flex-1 items-center justify-center", LOG_PALETTE.textTertiary)}>
          <Spinner label="Connecting to log stream…" />
        </div>
      ) : showError ? (
        <div className={cn("flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center", LOG_PALETTE.textError)}>
          <Terminal className="h-8 w-8" />
          <span className="text-xs">{streamError ?? "Log stream failed"}</span>
        </div>
      ) : groupedEntries.length === 0 ? (
        <div className={cn("relative flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center", LOG_PALETTE.textTertiary)}>
          <Terminal className="h-8 w-8" />
          <div className="text-xs">
            {buffer.entries.length > 0
              ? `Filters hide all ${buffer.entries.length.toLocaleString()} loaded lines`
              : previous
                ? "No logs from the previous container instance"
                : "No logs available"}
          </div>
          <ScrollToBottom
            visible={!buffer.isFollowing}
            pending={pendingLineCount}
            onScrollToBottom={resumeFollowing}
          />
        </div>
      ) : (
        <div className="relative min-h-0 flex-1">
          <div
            ref={scrollRef}
            className={cn("h-full selectable overflow-auto py-1 font-mono text-[calc(11px*var(--font-scale))]", LOG_PALETTE.textPrimary)}
            onScroll={(event) => {
              const element = event.currentTarget;
              const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
              if (atBottom) {
                if (!buffer.isFollowing) resumeFollowing();
              } else {
                pauseFollowing();
              }
            }}
          >
            <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const group = groupedEntries[virtualRow.index];
                if (!group) return null;
                return (
                  <div
                    key={group.head.id}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    className="absolute left-0 top-0 w-full"
                    style={{ top: virtualRow.start }}
                  >
                    <LogGroupItem
                      group={group}
                      searchQuery={search.mode === "hide" ? "" : search.query}
                      searchIsRegex={search.isRegex}
                      searchIsCaseSensitive={search.isCaseSensitive}
                      showTimestamp={showTimestamps}
                      tsFormat={tsFormat}
                      ansiEnabled={ansiEnabled}
                      isCurrentMatch={group.head.id === currentHighlightId}
                      wordWrap={wordWrap}
                      defaultExpanded={structuredMode === "expanded"}
                      rawStructured={structuredMode === "raw"}
                      onFilterValue={filterByValue}
                      isStackExpanded={expandedStacks.has(group.head.id)}
                      onToggleStack={toggleStack}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <ScrollToBottom
            visible={!buffer.isFollowing}
            pending={pendingLineCount}
            onScrollToBottom={resumeFollowing}
          />
        </div>
      )}

      <div
        className={cn(
          "flex h-6 shrink-0 items-center gap-3 border-t px-3 text-[calc(10px*var(--font-scale))]",
          LOG_PALETTE.border,
          LOG_PALETTE.toolbarBg,
          LOG_PALETTE.textTertiary,
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            connection === "streaming"
              ? "bg-emerald-500"
              : connection === "error"
                ? "bg-red-500"
                : connection === "ended"
                  ? "bg-slate-500"
                  : "animate-pulse bg-amber-500",
          )}
        />
        <span className="shrink-0">
          {connection === "streaming" ? "Streaming" : connection === "error" ? "Stream error" : connection === "ended" ? "Stream ended" : "Connecting"}
        </span>
        {streamError && buffer.entries.length > 0 ? <span className="truncate text-red-400">{streamError}</span> : null}
        <span className="shrink-0">{displayEntries.length.toLocaleString()} shown</span>
        {buffer.retainedLineCount > displayEntries.length ? (
          <span className="shrink-0">{buffer.retainedLineCount.toLocaleString()} buffered</span>
        ) : null}
        {search.query ? <span className="shrink-0">{search.matchCount.toLocaleString()} matches</span> : null}
        <span className="ml-auto truncate font-mono">
          {buffer.missingLineCount > 0
            ? "Older lines were dropped from the buffer"
            : buffer.isFollowing
              ? "Following output"
              : "Scroll paused — jump to end to follow"}
        </span>
      </div>
    </div>
  );
}

function ScrollToBottom({
  visible,
  pending,
  onScrollToBottom,
}: {
  visible: boolean;
  pending: number;
  onScrollToBottom: () => void;
}) {
  if (!visible) return null;
  return (
    <button
      type="button"
      onClick={onScrollToBottom}
      className="btn-brand absolute bottom-3 right-4 z-10 rounded-full px-3 py-1.5 text-xs shadow-lg"
    >
      Scroll to bottom
      {pending > 0 ? ` · ${pending >= 20_000 ? "20K+" : pending.toLocaleString()} new ${pending === 1 ? "line" : "lines"}` : ""}
    </button>
  );
}
