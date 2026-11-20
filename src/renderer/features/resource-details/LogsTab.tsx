import { useEffect, useState } from "react";
import { SquareTerminal } from "lucide-react";
import type { KubeObject } from "@shared/types";
import { api, call, errorText } from "../../lib/api";
import { Spinner } from "../../design-system/components/Spinner";
import { EmptyState } from "../../design-system/components/EmptyState";
import { LogsViewer } from "./logs/LogsViewer";

interface PodOption {
  name: string;
  namespace: string;
  containers: string[];
  initContainers: string[];
}

export function LogsTab({ clusterId, object }: { clusterId: string; object: KubeObject }) {
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
      <div className="min-h-0 flex-1">
        <LogsViewer
          key={`${pod.namespace}/${pod.name}`}
          clusterId={clusterId}
          namespace={pod.namespace}
          pod={pod.name}
          containers={pod.containers}
          initContainers={pod.initContainers}
        />
      </div>
    </div>
  );
}

async function findPods(clusterId: string, object: KubeObject): Promise<PodOption[]> {
  const spec = object.spec as any;
  const toOption = (pod: KubeObject): PodOption => ({
    name: pod.metadata?.name ?? "",
    namespace: pod.metadata?.namespace ?? "",
    containers: ((pod.spec?.containers ?? []) as Array<{ name: string }>).map((container) => container.name),
    initContainers: ((pod.spec?.initContainers ?? []) as Array<{ name: string }>).map((container) => container.name),
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
