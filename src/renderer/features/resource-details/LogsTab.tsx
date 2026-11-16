import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Pause,
  Play,
  RefreshCw,
  Search,
  Trash2,
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
          <span className="text-[10px] uppercase tracking-wide text-theme-text-tertiary">Pod</span>
          <select
            value={podName}
            onChange={(event) => setPodName(event.target.value)}
            className="h-6 max-w-[18rem] rounded border border-theme-border bg-theme-elevated px-1.5 text-[11px] text-theme-text-primary focus:outline-none"
          >
            {pods.map((entry) => (
              <option key={entry.name} value={entry.name}>
                {entry.name}
              </option>
            ))}
          </select>
          <span className="font-mono text-[10px] text-theme-text-disabled">
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
  const [text, setText] = useState("");
  const [connection, setConnection] = useState<"connecting" | "streaming" | "ended" | "error">("connecting");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [stick, setStick] = useState(true);
  const [nonce, setNonce] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bufferRef = useRef("");
  const streamIdRef = useRef("");

  // Stream lifecycle. Changing container / follow / previous / tail restarts it.
  useEffect(() => {
    if (!container) return;
    const streamId = `logs-${clusterId}-${namespace}-${pod}-${container}-${Date.now()}`;
    streamIdRef.current = streamId;
    let disposed = false;

    setText("");
    setStreamError(null);
    setConnection("connecting");
    bufferRef.current = "";

    const offChunk = api.logs.onChunk((payload) => {
      if (payload.streamId !== streamId || disposed) return;
      bufferRef.current += payload.chunk;
      if (bufferRef.current.length > 1_500_000) {
        const cut = bufferRef.current.lastIndexOf("\n", bufferRef.current.length - 1_000_000);
        bufferRef.current = bufferRef.current.slice(cut >= 0 ? cut + 1 : -1_000_000);
      }
    });

    const offEnd = api.logs.onEnd((payload) => {
      if (payload.streamId !== streamId || disposed) return;
      setConnection(payload.error ? "error" : "ended");
      if (payload.error) setStreamError(payload.error);
    });

    const flush = window.setInterval(() => {
      if (disposed) return;
      if (bufferRef.current) {
        const chunk = bufferRef.current;
        bufferRef.current = "";
        setText((current) => (current + chunk).slice(-1_500_000));
        setConnection("streaming");
      }
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

  const lines = useMemo(() => text.split("\n"), [text]);
  const matches = useMemo(() => {
    const term = query.trim();
    if (!term) return null;
    const lowered = term.toLowerCase();
    return lines.map((line) => line.toLowerCase().includes(lowered));
  }, [lines, query]);
  const matchCount = matches?.filter(Boolean).length ?? 0;

  useEffect(() => {
    if (!stick) return;
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [text, stick]);

  const download = () => {
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
      <div className="flex h-9 shrink-0 flex-wrap items-center gap-1.5 border-b border-white/10 bg-[#111b2e] px-2">
        <select
          value={container}
          onChange={(event) => setContainer(event.target.value)}
          className="h-6 max-w-[14rem] rounded border border-white/10 bg-white/5 px-1.5 text-[11px] text-slate-200 focus:outline-none"
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
          className="h-6 rounded border border-white/10 bg-white/5 px-1 text-[10px] text-slate-300 focus:outline-none"
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

        <div className="ml-auto flex items-center gap-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find in logs…"
              className="h-6 w-40 rounded border border-white/10 bg-white/5 pl-6 pr-1.5 text-[11px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-skyhook-500"
            />
          </div>
          {query ? <span className="text-[10px] text-slate-400">{matchCount}</span> : null}
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
            onClick={() => setText("")}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-white/5 px-3 py-1 text-[10px] text-slate-500">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            connection === "streaming"
              ? "bg-emerald-500"
              : connection === "error"
                ? "bg-red-500"
                : connection === "ended"
                  ? "bg-slate-500"
                  : "animate-pulse bg-amber-500",
          )}
        />
        <span>
          {connection === "streaming"
            ? "Streaming"
            : connection === "error"
              ? "Stream error"
              : connection === "ended"
                ? "Stream ended"
                : "Connecting"}
        </span>
        <span className="font-mono">
          {namespace}/{pod}
        </span>
        {streamError ? <span className="truncate text-red-400">{streamError}</span> : null}
        <button
          type="button"
          className="ml-auto text-[10px] text-slate-400 hover:text-slate-200"
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
        className="min-h-0 flex-1 overflow-auto px-2 py-1 font-mono text-[11px] leading-5 selectable"
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
        {lines.map((line, index) => {
          if (query && matches && !matches[index]) return null;
          const isError = /error|fatal|panic|exception/i.test(line);
          const isWarn = /warn/i.test(line);
          return (
            <div key={index} className="flex whitespace-pre-wrap break-all hover:bg-white/5">
              <span className="w-10 shrink-0 select-none pr-2 text-right text-slate-600">{index + 1}</span>
              <span className={cn(isError ? "text-red-400" : isWarn ? "text-amber-300" : "text-slate-300")}>
                {line || " "}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex h-6 shrink-0 items-center gap-3 border-t border-white/10 bg-[#111b2e] px-3 text-[10px] text-slate-500">
        <span>{lines.length} lines</span>
        {query ? <span>{matchCount} matches</span> : null}
        <span className="ml-auto">
          {stick ? "Following output" : "Scroll paused — jump to end to follow"}
        </span>
      </div>
    </div>
  );
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
        "flex h-6 items-center gap-1 rounded border px-1.5 text-[10px] transition-colors",
        active
          ? "border-skyhook-500/60 bg-skyhook-500/20 text-skyblue-200"
          : "border-white/10 bg-white/5 text-slate-400 hover:text-slate-200",
      )}
    >
      {children}
    </button>
  );
}
