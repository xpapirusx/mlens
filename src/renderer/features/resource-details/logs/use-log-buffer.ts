import { useCallback, useRef, useState } from "react";
import { isLogfmt } from "./log-format";
import { detectLevel } from "./log-level";
import type { LogEntry } from "./log-types";

export type { LevelSource, LogLevel } from "./log-types";
export type { LogEntry } from "./log-types";

/** Hard cap on retained lines — the viewer never holds more than this in memory. */
const MAX_BUFFER_SIZE = 20_000;

function isJsonContent(content: string): boolean {
  const trimmed = content.trimStart();
  return trimmed[0] === "{" && trimmed[trimmed.length - 1] === "}";
}

type RawLogEntry = Omit<LogEntry, "id" | "level" | "levelSource" | "isJson" | "isLogfmt">;

export interface LogBuffer {
  entries: LogEntry[];
  isFollowing: boolean;
  retainedLineCount: number;
  missingLineCount: number;
  pendingLineCount: number;
  /** Id of the newest line in the live buffer, even while the reading window is frozen. */
  latestEntryId: number;
  getRetainedEntries: () => LogEntry[];
  setFollowing: (following: boolean) => void;
  appendBatch: (entries: RawLogEntry[]) => void;
  clear: () => void;
}

/**
 * Holds the streamed lines. While the reader scrolls away the visible window is
 * frozen (`reading`), so incoming lines never move the text under the cursor;
 * returning to the bottom swaps back to the live buffer.
 */
export function useLogBuffer(): LogBuffer {
  const [buffer, setBuffer] = useState<{ latest: LogEntry[]; reading: LogEntry[] | null }>({
    latest: [],
    reading: null,
  });
  const idCounter = useRef(0);

  const enrichEntry = useCallback((raw: RawLogEntry): LogEntry => {
    const isJson = isJsonContent(raw.content);
    const detected = detectLevel(raw.content);
    return {
      ...raw,
      id: idCounter.current++,
      level: detected.level,
      levelSource: detected.source,
      isJson,
      isLogfmt: !isJson && isLogfmt(raw.content),
    };
  }, []);

  const appendBatch = useCallback(
    (batch: RawLogEntry[]) => {
      if (batch.length === 0) return;
      const enriched = batch.map(enrichEntry);
      setBuffer((prev) => {
        const combined = prev.latest.concat(enriched);
        const latest = combined.length > MAX_BUFFER_SIZE ? combined.slice(combined.length - MAX_BUFFER_SIZE) : combined;
        // Keep appending inside the frozen reading window while it still fits;
        // once eviction starts, retain exactly the lines being read.
        const reading =
          prev.reading === null
            ? null
            : prev.reading === prev.latest && combined.length <= MAX_BUFFER_SIZE
              ? latest
              : prev.reading;
        return { latest, reading };
      });
    },
    [enrichEntry],
  );

  const clear = useCallback(() => {
    setBuffer({ latest: [], reading: null });
  }, []);

  const setFollowing = useCallback((following: boolean) => {
    setBuffer((prev) => {
      if (following) return prev.reading === null ? prev : { ...prev, reading: null };
      return prev.reading === null ? { ...prev, reading: prev.latest } : prev;
    });
  }, []);

  const entries = buffer.reading ?? buffer.latest;
  const pendingLineCount = (buffer.latest.at(-1)?.id ?? -1) - (entries.at(-1)?.id ?? -1);
  const readingLastId = entries.at(-1)?.id ?? -1;
  const latestFirstId = buffer.latest[0]?.id ?? 0;
  const overlap = Math.max(0, readingLastId - latestFirstId + 1);
  const retainedLineCount = buffer.reading === null ? buffer.latest.length : entries.length + buffer.latest.length - overlap;
  const missingLineCount = buffer.reading === null ? 0 : Math.max(0, latestFirstId - readingLastId - 1);
  const getRetainedEntries = useCallback(() => {
    if (buffer.reading === null || buffer.reading === buffer.latest) return buffer.latest;
    const lastId = buffer.reading.at(-1)?.id ?? -1;
    return [...buffer.reading, ...buffer.latest.filter((entry) => entry.id > lastId)];
  }, [buffer]);

  return {
    entries,
    isFollowing: buffer.reading === null,
    retainedLineCount,
    missingLineCount,
    pendingLineCount,
    latestEntryId: buffer.latest.at(-1)?.id ?? -1,
    getRetainedEntries,
    setFollowing,
    appendBatch,
    clear,
  };
}
