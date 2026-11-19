import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDownToLine,
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { KubeObject } from "@shared/types";
import { api, call, errorText } from "../../lib/api";
import { cn } from "../../lib/cn";
import { Spinner } from "../../design-system/components/Spinner";
import { EmptyState } from "../../design-system/components/EmptyState";
import { SquareTerminal } from "lucide-react";

interface PodOption {
  name: string;
  namespace: string;
  containers: string[];
}

export function LogsTab({
  clusterId,
  object,
}: {
  clusterId: string;
  object: KubeObject;
}) {
  const [pods, setPods] = useState<PodOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [podName, setPodName] = useState<string>("");

  const namespace = object.metadata?.namespace;

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      setLoading(true);
      try {
        const found = await findPods(clusterId, object);
        if (disposed) return;
        setPods(found);
        setPodName((current) => (found.some((pod) => pod.name === current) ? current : (found[0]?.name ?? "")));
        setError(null);
      } catch (fetchError) {
        if (!disposed) setError(errorText(fetchError));
      } finally {
        if (!disposed) setLoading(false);
      }
    };
    void load();
    return () => {
      disposed = true;
    };
  }, [clusterId, object]);

  const pod = pods.find((entry) => entry.name === podName);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner label="Finding pods…" />
      </div>
    );
  }

  if (error) {
    return <div className="p-4 text-sm text-red-600 dark:text-red-400">{error}</div>;
  }

  if (!pod) {
    return (
      <EmptyState
        icon={<SquareTerminal />}
        title="No pods to stream"
        description={
          namespace
            ? "This resource has no running pods in its namespace. Pods may be scaled to zero or still starting."
            : "Logs are available for Pods, workloads, Services and Nodes."
        }
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {pods.length > 1 || object.kind !== "Pod" ? (
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-theme-border bg-theme-base px-2">
          <span className="text-[calc(10px*var(--font-scale))] uppercase tracking-wide text-theme-text-tertiary">Pod</span>
          <select
            value={podName}
            onChange={(event) => setPodName(event.target.value)}
            className="h-6 max-w-[18rem] rounded border border-theme-border bg-theme-elevated px-1.5 text-[calc(11px*var(--font-scale))] text-theme-text-primary focus:outline-none"
          >
            {pods.map((entry) => (
              <option key={entry.name} value={entry.name}>
                {entry.name}
              </option>
            ))}
          </select>
          <span className="font-mono text-[calc(10px*var(--font-scale))] text-theme-text-disabled">
            {pod.namespace}/{pod.name}
          </span>
        </div>
      ) : null}
      <LogsViewer
        key={`${pod.namespace}/${pod.name}`}
        clusterId={clusterId}
        namespace={pod.namespace}
        pod={pod.name}
        containers={pod.containers}
      />
    </div>
  );
}

async function findPods(clusterId: string, object: KubeObject): Promise<PodOption[]> {
  const spec = object.spec as any;
  const toOption = (pod: KubeObject): PodOption => ({
    name: pod.metadata?.name ?? "",
    namespace: pod.metadata?.namespace ?? "",
    containers: ((pod.spec?.containers ?? []) as Array<{ name: string }>).map((container) => container.name),
  });

  if (object.kind === "Pod") return [toOption(object)];

  const namespace = object.metadata?.namespace;
  const kind = object.kind;
  let pods: KubeObject[] = [];

  if (kind === "Node") {
    const result = await call(
      api.resources.list({
        clusterId,
        apiVersion: "v1",
        kind: "Pod",
        fieldSelector: `spec.nodeName=${object.metadata?.name}`,
        limit: 1000,
      }),
    );
    pods = result.items;
  } else if (["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job", "CronJob"].includes(kind)) {
    const selector =
      (spec?.selector as any)?.matchLabels ??
      (spec?.template?.metadata?.labels as Record<string, string> | undefined) ??
      {};
    const result = await call(
      api.resources.list({
        clusterId,
        apiVersion: "v1",
        kind: "Pod",
        namespace,
        limit: 2000,
      }),
    );
    pods = result.items.filter((pod) => {
      if (!selector || Object.keys(selector).length === 0) return true;
      return Object.entries(selector).every(([key, value]) => pod.metadata?.labels?.[key] === value);
    });
  } else if (kind === "Service") {
    const selector = (spec?.selector ?? {}) as Record<string, string>;
    if (Object.keys(selector).length === 0) return [];
    const result = await call(
      api.resources.list({ clusterId, apiVersion: "v1", kind: "Pod", namespace, limit: 2000 }),
    );
    pods = result.items.filter((pod) =>
      Object.entries(selector).every(([key, value]) => pod.metadata?.labels?.[key] === value),
    );
  } else if (kind === "CronJob") {
    const result = await call(
      api.resources.list({ clusterId, apiVersion: "v1", kind: "Pod", namespace, limit: 2000 }),
    );
    pods = result.items;
  } else {
    return [];
  }

  return pods
    .sort((a, b) => {
      const left = new Date(b.metadata?.creationTimestamp ?? 0).getTime();
      const right = new Date(a.metadata?.creationTimestamp ?? 0).getTime();
      return left - right;
    })
    .map(toOption);
}

/** Level of a log line for the CSS tint — crit beats error beats warn. */
const levelOf = (line: string): "crit" | "error" | "warn" | null => {
  if (/\b(crit|critical|fatal|panic)\b/i.test(line)) return "crit";
  if (/\b(error|exception|traceback)\b/i.test(line)) return "error";
  if (/\bwarn(ing)?\b/i.test(line)) return "warn";
  return null;
};

const LEVEL_TINT: Record<string, string> = {
  crit: "bg-red-500/15 text-red-300",
  error: "bg-red-500/10 text-red-400",
  warn: "bg-amber-500/10 text-amber-300",
};

/** A17: hard cap on retained lines — replaces the old 1.5MB string slice. */
const MAX_LOG_LINES = 20_000;
/** A single line longer than this is force-split (no newline in sight). */
const MAX_PARTIAL_LINE = 100_000;

function appendLines(current: string[], next: string[]): string[] {
  const merged = current.concat(next);
  return merged.length > MAX_LOG_LINES ? merged.slice(merged.length - MAX_LOG_LINES) : merged;
}

function LogsViewer({
  clusterId,
  namespace,
  pod,
  containers,
}: {
  clusterId: string;
  namespace: string;
  pod: string;
  containers: string[];
}) {
  const [container, setContainer] = useState(containers[0] ?? "");
  const [follow, setFollow] = useState(true);
  const [previous, setPrevious] = useState(false);
  const [timestamps, setTimestamps] = useState(false);
  const [tailLines, setTailLines] = useState(500);
  // A17: lines live as an array of strings — a 1.5MB `text` state used to be
  // re-concatenated and re-split every 160ms, then rendered as tens of
  // thousands of DOM rows.
  const [lines, setLines] = useState<string[]>([]);
  const [connection, setConnection] = useState<"connecting" | "streaming" | "ended" | "error">("connecting");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [stick, setStick] = useState(true);
  const [nonce, setNonce] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bufferRef = useRef("");
  /** Trailing line that has not seen its newline yet. */
  const partialRef = useRef("");
  const streamIdRef = useRef("");

  // Stream lifecycle. Changing container / follow / previous / tail restarts it.
  useEffect(() => {
    if (!container) return;
    const streamId = `logs-${clusterId}-${namespace}-${pod}-${container}-${Date.now()}`;
    streamIdRef.current = streamId;
    let disposed = false;

    setLines([]);
    setStreamError(null);
    setConnection("connecting");
    bufferRef.current = "";
    partialRef.current = "";

    /** Move buffered chunks into `lines` as complete rows (A17). */
    const drain = () => {
      const chunk = bufferRef.current;
      if (!chunk) return;
      bufferRef.current = "";
      setConnection("streaming");
      const data = partialRef.current + chunk;
      const cut = data.lastIndexOf("\n");
      if (cut === -1) {
        // No newline yet: keep it as the tail, force-splitting a runaway line.
        if (data.length > MAX_PARTIAL_LINE) {
          const head = data.slice(0, MAX_PARTIAL_LINE);
          partialRef.current = data.slice(MAX_PARTIAL_LINE);
          setLines((current) => appendLines(current, [head]));
        } else {
          partialRef.current = data;
        }
        return;
      }
      partialRef.current = data.slice(cut + 1);
      setLines((current) => appendLines(current, data.slice(0, cut).split("\n")));
    };

    const offChunk = api.logs.onChunk((payload) => {
      if (payload.streamId !== streamId || disposed) return;
      bufferRef.current += payload.chunk;
      if (bufferRef.current.length > 1_500_000) drain();
    });

    const offEnd = api.logs.onEnd((payload) => {
      if (payload.streamId !== streamId || disposed) return;
      // Flush the tail: a stream that ends without a newline still has a
      // final line sitting in `partialRef`.
      drain();
      if (partialRef.current) {
        const tail = partialRef.current;
        partialRef.current = "";
        setLines((current) => appendLines(current, [tail]));
      }
      setConnection(payload.error ? "error" : "ended");
      if (payload.error) setStreamError(payload.error);
    });

    const flush = window.setInterval(() => {
      if (!disposed) drain();
    }, 160);

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
        timestamps,
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
  }, [clusterId, namespace, pod, container, follow, previous, timestamps, tailLines, nonce]);

  const matches = useMemo(() => {
    const term = query.trim();
    if (!term) return null;
    const lowered = term.toLowerCase();
    return lines.map((line) => line.toLowerCase().includes(lowered));
  }, [lines, query]);
  const matchCount = matches?.filter(Boolean).length ?? 0;
  const matchIndices = useMemo(() => {
    if (!matches) return [];
    const indices: number[] = [];
    matches.forEach((isMatch, index) => {
      if (isMatch) indices.push(index);
    });
    return indices;
  }, [matches]);
  // A17: with a query active, virtualize the matching subset — the old
  // render skipped non-matches in place, which absolute rows cannot do.
  const visible = useMemo(() => {
    if (!matches) return null;
    const out: Array<{ text: string; index: number }> = [];
    for (let index = 0; index < lines.length; index += 1) {
      if (matches[index]) out.push({ text: lines[index], index });
    }
    return out;
  }, [lines, matches]);

  const virtualizer = useVirtualizer({
    count: visible ? visible.length : lines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 20,
    overscan: 20,
  });

  const [matchCursor, setMatchCursor] = useState(0);

  const scrollToLine = (lineNumber: number) => {
    const target = visible ? visible.findIndex((entry) => entry.index === lineNumber) : lineNumber;
    if (target < 0) return;
    virtualizer.scrollToIndex(target, { align: "center" });
    // The row exists only after the jump renders — centre it precisely.
    window.requestAnimationFrame(() => {
      scrollRef.current
        ?.querySelector<HTMLElement>(`[data-line="${lineNumber}"]`)
        ?.scrollIntoView({ block: "center" });
    });
  };

  /** Enter / Shift+Enter and the arrows walk the matches, Radar-style. */
  const goToMatch = (delta: number) => {
    if (matchIndices.length === 0) return;
    const next = (matchCursor + delta + matchIndices.length) % matchIndices.length;
    setMatchCursor(next);
    setStick(false); // stop following output while inspecting a match
    scrollToLine(matchIndices[next]);
  };

  // A new query starts at its first match and scrolls there; new log lines
  // arriving during follow only clamp the cursor instead of yanking the view.
  const previousQuery = useRef(query);
  useEffect(() => {
    const queryChanged = previousQuery.current !== query;
    previousQuery.current = query;
    if (queryChanged) {
      setMatchCursor(0);
      if (matchIndices.length > 0) {
        const timer = window.setTimeout(() => scrollToLine(matchIndices[0]), 40);
        return () => window.clearTimeout(timer);
      }
      return undefined;
    }
    setMatchCursor((current) => Math.min(current, Math.max(0, matchIndices.length - 1)));
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, matchIndices]);

  useEffect(() => {
    if (!stick) return;
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lines, stick]);

  // Ctrl/Cmd+F opens the log search, like Radar — but never steals the key
  // from a focused input or from a terminal (xterm binds it itself).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "f") return;
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest(".xterm")) return;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      event.preventDefault();
      setSearchOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const download = () => {
    const tail = partialRef.current;
    const text = lines.join("\n") + (tail ? `\n${tail}` : "");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${namespace}_${pod}_${container}.log`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0f172a]">
      <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-1.5 border-b border-white/10 bg-[#111b2e] px-2 py-1">
        <select
          value={container}
          onChange={(event) => setContainer(event.target.value)}
          className="h-6 max-w-[13rem] rounded border border-white/10 bg-white/5 px-1.5 text-[calc(11px*var(--font-scale))] text-slate-200 focus:outline-none"
          title="Container"
        >
          {containers.map((name) => (
            <option key={name} value={name} className="bg-slate-900">
              {name}
            </option>
          ))}
        </select>

        <select
          value={tailLines}
          onChange={(event) => setTailLines(Number(event.target.value))}
          className="h-6 rounded border border-white/10 bg-white/5 px-1 text-[calc(10px*var(--font-scale))] text-slate-300 focus:outline-none"
          title="Tail lines"
        >
          {[200, 500, 1000, 5000].map((value) => (
            <option key={value} value={value} className="bg-slate-900">
              {value} lines
            </option>
          ))}
        </select>

        <Toggle active={follow} onClick={() => setFollow((value) => !value)} title="Follow logs">
          {follow ? <Play className="h-2.5 w-2.5" /> : <Pause className="h-2.5 w-2.5" />}
          Follow
        </Toggle>
        <Toggle active={previous} onClick={() => setPrevious((value) => !value)} title="Previous container logs">
          Previous
        </Toggle>
        <Toggle active={timestamps} onClick={() => setTimestamps((value) => !value)} title="Show timestamps">
          Time
        </Toggle>

        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            title="Find in logs"
            className={cn(
              "rounded p-1 text-slate-400 hover:bg-white/10 hover:text-slate-200",
              searchOpen && "bg-skyhook-500/20 text-sky-200",
            )}
            onClick={() => setSearchOpen((value) => !value)}
          >
            <Search className="h-3 w-3" />
          </button>
          <button
            type="button"
            title="Reconnect"
            className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-slate-200"
            onClick={() => setNonce((value) => value + 1)}
          >
            <RefreshCw className="h-3 w-3" />
          </button>
          <button
            type="button"
            title="Download logs"
            className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-slate-200"
            onClick={download}
          >
            <ArrowDownToLine className="h-3 w-3" />
          </button>
          <button
            type="button"
            title="Clear"
            className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-slate-200"
            onClick={() => {
              setLines([]);
              bufferRef.current = "";
              partialRef.current = "";
            }}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {searchOpen ? (
        <div className="flex h-7 shrink-0 items-center gap-2 border-b border-white/10 bg-[#0f172a] px-2">
          <Search className="h-3 w-3 shrink-0 text-slate-500" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                goToMatch(event.shiftKey ? -1 : 1);
              } else if (event.key === "Escape") {
                event.preventDefault();
                setQuery("");
                setSearchOpen(false);
              }
            }}
            placeholder="Find in logs…"
            className="h-5 min-w-0 flex-1 bg-transparent text-[calc(11px*var(--font-scale))] text-slate-200 placeholder:text-slate-500 focus:outline-none"
          />
          {query ? (
            <span className="shrink-0 font-mono text-[calc(10px*var(--font-scale))] text-slate-400">
              {matchIndices.length > 0 ? `${matchCursor + 1} / ${matchIndices.length}` : "0 results"}
            </span>
          ) : null}
          <button
            type="button"
            title="Previous match (Shift+Enter)"
            disabled={matchIndices.length === 0}
            onClick={() => goToMatch(-1)}
            className="rounded p-0.5 text-slate-400 hover:text-slate-200 disabled:opacity-30"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            title="Next match (Enter)"
            disabled={matchIndices.length === 0}
            onClick={() => goToMatch(1)}
            className="rounded p-0.5 text-slate-400 hover:text-slate-200 disabled:opacity-30"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
          <button
            type="button"
            className="rounded p-0.5 text-slate-500 hover:text-slate-200"
            onClick={() => {
              setQuery("");
              setSearchOpen(false);
            }}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : null}

      <div className="flex h-6 shrink-0 items-center gap-2 border-b border-white/5 bg-[#111b2e]/60 px-2 text-[calc(10px*var(--font-scale))] text-slate-500">
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
          {connection === "streaming"
            ? "Streaming"
            : connection === "error"
              ? "Stream error"
              : connection === "ended"
                ? "Stream ended"
                : "Connecting"}
        </span>
        <span className="min-w-0 truncate font-mono text-slate-500">
          {namespace}/{pod}
        </span>
        {streamError ? <span className="truncate text-red-400">{streamError}</span> : null}
        <button
          type="button"
          className="ml-auto shrink-0 text-[calc(10px*var(--font-scale))] text-slate-400 hover:text-slate-200"
          onClick={() => {
            setStick(true);
            const element = scrollRef.current;
            if (element) element.scrollTop = element.scrollHeight;
          }}
        >
          Jump to end
        </button>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto px-2 py-1 font-mono text-[calc(11px*var(--font-scale))] leading-5 selectable"
        onScroll={(event) => {
          const element = event.currentTarget;
          setStick(element.scrollHeight - element.scrollTop - element.clientHeight < 40);
        }}
      >
        {lines.length <= 1 && connection === "connecting" ? (
          <div className="flex items-center gap-2 px-2 py-2 text-slate-500">
            <Spinner className="text-slate-500" label="Connecting to log stream…" />
          </div>
        ) : null}
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const entry = visible
              ? visible[virtualRow.index]
              : { text: lines[virtualRow.index], index: virtualRow.index };
            const level = levelOf(entry.text);
            return (
              <div
                key={entry.index}
                data-line={entry.index}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className={cn(
                  "absolute left-0 top-0 flex w-full whitespace-pre-wrap break-all rounded-sm hover:bg-white/5",
                  level && LEVEL_TINT[level],
                )}
                style={{ top: virtualRow.start }}
              >
                <span className="w-10 shrink-0 select-none pr-2 text-right text-slate-600">{entry.index + 1}</span>
                <span className={cn(!level && "text-slate-300")}>
                  <Highlighted text={entry.text} query={query.trim()} />
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex h-6 shrink-0 items-center gap-3 border-t border-white/10 bg-[#111b2e] px-3 text-[calc(10px*var(--font-scale))] text-slate-500">
        <span>{lines.length} lines</span>
        {query ? <span>{matchCount} matches</span> : null}
        <span className="ml-auto">
          {stick ? "Following output" : "Scroll paused — jump to end to follow"}
        </span>
      </div>
    </div>
  );
}

/** Wraps every case-insensitive occurrence of `query` in a mark, browser-find style. */
function Highlighted({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text || " "}</>;
  const needle = query.toLowerCase();
  const lowered = text.toLowerCase();
  const parts: React.ReactNode[] = [];
  let from = 0;
  let at = lowered.indexOf(needle, from);
  let key = 0;
  while (at >= 0 && needle) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark key={key} className="rounded-[2px] bg-yellow-400/35 text-yellow-100">
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    key += 1;
    from = at + needle.length;
    at = lowered.indexOf(needle, from);
  }
  parts.push(text.slice(from));
  return <>{parts.length > 0 ? parts : text || " "}</>;
}

function Toggle({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "flex h-6 items-center gap-1 rounded border px-1.5 text-[calc(10px*var(--font-scale))] transition-colors",
        active
          ? "border-skyhook-500/60 bg-skyhook-500/20 text-skyblue-200"
          : "border-white/10 bg-white/5 text-slate-400 hover:text-slate-200",
      )}
    >
      {children}
    </button>
  );
}
