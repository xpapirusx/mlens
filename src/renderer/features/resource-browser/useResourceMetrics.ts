import { useEffect, useState } from "react";
import type { ApiResourceInfo, KubeObject } from "@shared/types";
import { api, call } from "../../lib/api";
import { parseCpu, parseMemory } from "../../lib/format";

export interface ContainerUsage {
  name: string;
  cpu: number;
  memory: number;
}

export interface PodUsage {
  containers: ContainerUsage[];
  timestamp?: string;
}

export interface NodeUsage {
  cpu: number;
  memory: number;
  timestamp?: string;
}

export interface MetricsState {
  available: boolean;
  pods: Map<string, PodUsage>;
  nodes: Map<string, NodeUsage>;
}

const EMPTY: MetricsState = { available: false, pods: new Map(), nodes: new Map() };

/**
 * Live metrics.k8s.io samples for the visible table. Metrics are optional: if
 * the API is not installed the CPU/Memory cells render "–" rather than fake
 * numbers.
 */
export function useResourceMetrics(options: {
  clusterId: string;
  resource: ApiResourceInfo | undefined;
  resources: ApiResourceInfo[];
  namespaces: string[];
  refreshSeconds: number;
  active: boolean;
}): MetricsState {
  const { clusterId, resource, resources, namespaces, refreshSeconds, active } = options;
  const [state, setState] = useState<MetricsState>(EMPTY);

  const podMetrics = resources.find((entry) => entry.kind === "PodMetrics");
  const nodeMetrics = resources.find((entry) => entry.kind === "NodeMetrics");
  const kind = resource?.kind;
  const needsPods = kind === "Pod";
  const needsNodes = kind === "Node";
  const enabled = active && (needsPods ? Boolean(podMetrics) : needsNodes ? Boolean(nodeMetrics) : false);
  const scopeKey = [...namespaces].sort().join(",");

  useEffect(() => {
    if (!enabled) {
      setState(EMPTY);
      return;
    }
    let disposed = false;
    const load = async () => {
      try {
        const pods = new Map<string, PodUsage>();
        const nodes = new Map<string, NodeUsage>();

        if (needsPods && podMetrics) {
          const scopes: Array<string | undefined> =
            namespaces.length === 0 ? [undefined] : namespaces;
          const results = await Promise.all(
            scopes.map((scope) =>
              call(
                api.resources.list({
                  clusterId,
                  apiVersion: podMetrics.apiVersion,
                  kind: podMetrics.kind,
                  namespace: scope,
                  limit: 2000,
                }),
              ),
            ),
          );
          for (const result of results) {
            for (const item of result.items as KubeObject[]) {
              const key = `${item.metadata?.namespace}/${item.metadata?.name}`;
              const containers = ((item.containers ?? []) as Array<Record<string, any>>).map((container) => ({
                name: String(container.name ?? ""),
                cpu: parseCpu(container.usage?.cpu) ?? 0,
                memory: parseMemory(container.usage?.memory) ?? 0,
              }));
              pods.set(key, { containers, timestamp: item.timestamp as string | undefined });
            }
          }
        }

        if (needsNodes && nodeMetrics) {
          const result = await call(
            api.resources.list({
              clusterId,
              apiVersion: nodeMetrics.apiVersion,
              kind: nodeMetrics.kind,
              limit: 1000,
            }),
          );
          for (const item of result.items as KubeObject[]) {
            nodes.set(item.metadata?.name ?? "", {
              cpu: parseCpu((item.usage as any)?.cpu) ?? 0,
              memory: parseMemory((item.usage as any)?.memory) ?? 0,
              timestamp: item.timestamp as string | undefined,
            });
          }
        }

        if (!disposed) {
          setState({ available: needsPods ? pods.size > 0 : nodes.size > 0, pods, nodes });
        }
      } catch {
        if (!disposed) setState(EMPTY);
      }
    };

    void load();
    const interval = refreshSeconds > 0 ? Math.max(10, refreshSeconds) : 0;
    if (!interval) return () => { disposed = true; };
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, interval * 1000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [
    clusterId,
    enabled,
    needsPods,
    needsNodes,
    podMetrics,
    nodeMetrics,
    scopeKey,
    refreshSeconds,
  ]);

  return state;
}
