import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { escapeRegExp, stripAnsi } from "./log-format";
import type { LogEntry } from "./log-types";

export type LogSearchMode = "highlight" | "only" | "hide";

interface UseLogSearchReturn {
  query: string;
  /** The deferred query the match scan was computed for. */
  deferredQuery: string;
  setQuery: (query: string) => void;
  isRegex: boolean;
  toggleRegex: () => void;
  setIsRegex: (value: boolean) => void;
  isCaseSensitive: boolean;
  toggleCaseSensitive: () => void;
  mode: LogSearchMode;
  setMode: (mode: LogSearchMode) => void;
  isFiltering: boolean;
  matchCount: number;
  currentMatch: number;
  matchIndices: number[];
  filteredEntries: LogEntry[];
  regexError: string | null;
  goToNext: () => void;
  goToPrev: () => void;
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

/**
 * The lines a search mode leaves visible. Only and Hide act on whole records:
 * a match on any line of a stack trace keeps or hides the trace together.
 */
export function applySearchMode<T extends { id: number }>(
  entries: readonly T[],
  matchIndices: readonly number[],
  mode: LogSearchMode,
  recordIdOf: (entry: T) => number = (entry) => entry.id,
): T[] {
  if (mode === "highlight") return [...entries];
  const matchedRecords = new Set(matchIndices.map((index) => recordIdOf(entries[index])));
  const keepMatches = mode === "only";
  return entries.filter((entry) => matchedRecords.has(recordIdOf(entry)) === keepMatches);
}

/**
 * Search over the buffered lines: literal or regex, case-sensitive or not, and
 * three modes — highlight matches in place, show only matching records, or
 * hide them (`grep -v`). Match scanning is deferred so typing never blocks on a
 * large buffer.
 */
export function useLogSearch(
  entries: LogEntry[],
  scrollToIndex: (index: number) => void,
  recordIdOf?: (entry: LogEntry) => number,
  onNavigate?: () => void,
): UseLogSearchReturn {
  const [query, setQuery] = useState("");
  const [isRegex, setIsRegex] = useState(false);
  const [isCaseSensitive, setIsCaseSensitive] = useState(false);
  const [mode, setMode] = useState<LogSearchMode>("highlight");
  const [currentMatch, setCurrentMatch] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  const deferredQuery = useDeferredValue(query);

  const { matchIndices, regexError } = useMemo(() => {
    if (!deferredQuery) return { matchIndices: [] as number[], regexError: null };
    try {
      const pattern = isRegex
        ? new RegExp(deferredQuery, isCaseSensitive ? "g" : "gi")
        : new RegExp(escapeRegExp(deferredQuery), isCaseSensitive ? "g" : "gi");
      const indices: number[] = [];
      for (let i = 0; i < entries.length; i += 1) {
        if (pattern.test(stripAnsi(entries[i].content))) indices.push(i);
        pattern.lastIndex = 0;
      }
      return { matchIndices: indices, regexError: null };
    } catch (error) {
      return { matchIndices: [] as number[], regexError: error instanceof Error ? error.message : "Invalid regex" };
    }
  }, [entries, deferredQuery, isRegex, isCaseSensitive]);

  // Gate on the live query too, so clearing or closing search unfilters immediately.
  const isFiltering = mode !== "highlight" && Boolean(query) && Boolean(deferredQuery) && !regexError;
  const filteredEntries = useMemo(
    () => (isFiltering ? applySearchMode(entries, matchIndices, mode, recordIdOf) : entries),
    [entries, isFiltering, mode, matchIndices, recordIdOf],
  );
  const filteredIndexById = useMemo(() => {
    if (mode !== "only" || !isFiltering) return null;
    return new Map(filteredEntries.map((entry, index) => [entry.id, index]));
  }, [mode, isFiltering, filteredEntries]);

  const prevCriteria = useRef({ query, isRegex, isCaseSensitive });
  useEffect(() => {
    if (
      prevCriteria.current.query !== query ||
      prevCriteria.current.isRegex !== isRegex ||
      prevCriteria.current.isCaseSensitive !== isCaseSensitive
    ) {
      setCurrentMatch(0);
      prevCriteria.current = { query, isRegex, isCaseSensitive };
    }
  }, [query, isRegex, isCaseSensitive]);

  const scrollToMatch = useCallback(
    (matchIdx: number) => {
      if (matchIdx < 0 || matchIdx >= matchIndices.length || mode === "hide") return;
      onNavigate?.();
      if (mode === "only") {
        const index = filteredIndexById?.get(entries[matchIndices[matchIdx]].id);
        if (index === undefined) return;
        scrollToIndex(index);
      } else {
        scrollToIndex(matchIndices[matchIdx]);
      }
    },
    [entries, filteredIndexById, matchIndices, mode, onNavigate, scrollToIndex],
  );

  const goToNext = useCallback(() => {
    if (matchIndices.length === 0 || mode === "hide") return;
    const next = (currentMatch + 1) % matchIndices.length;
    setCurrentMatch(next);
    scrollToMatch(next);
  }, [currentMatch, matchIndices.length, mode, scrollToMatch]);

  const goToPrev = useCallback(() => {
    if (matchIndices.length === 0 || mode === "hide") return;
    const prev = (currentMatch - 1 + matchIndices.length) % matchIndices.length;
    setCurrentMatch(prev);
    scrollToMatch(prev);
  }, [currentMatch, matchIndices.length, mode, scrollToMatch]);

  const toggleRegex = useCallback(() => setIsRegex((value) => !value), []);
  const toggleCaseSensitive = useCallback(() => setIsCaseSensitive((value) => !value), []);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
    setQuery("");
  }, []);

  return {
    query,
    deferredQuery,
    setQuery,
    isRegex,
    toggleRegex,
    setIsRegex,
    isCaseSensitive,
    toggleCaseSensitive,
    mode,
    setMode,
    isFiltering,
    matchCount: matchIndices.length,
    currentMatch,
    matchIndices,
    filteredEntries,
    regexError,
    goToNext,
    goToPrev,
    isOpen,
    open,
    close,
  };
}
