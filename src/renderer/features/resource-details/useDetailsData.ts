import { useCallback, useEffect, useRef, useState } from "react";
import type { KubeObject, ResourceKey } from "@shared/types";
import { api, call, errorText } from "../../lib/api";
import { helmDetailRow } from "../../lib/helm";
import { resourceStatus } from "../../lib/status";

export interface ResourceObjectState {
  object: KubeObject | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useResourceObject(
  clusterId: string,
  ref: ResourceKey | null,
  refreshSeconds: number,
): ResourceObjectState {
  const [object, setObject] = useState<KubeObject | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gen = useRef(0);

  const refresh = useCallback(async () => {
    if (!ref) return;
    const current = ++gen.current;
    setLoading(true);
    try {
      // Helm releases are parsed from secrets in main, not read from an API
      // resource, so this one kind takes a different path.
      const next =
        ref.kind === "HelmRelease" && ref.apiVersion === "helm.sh/v1"
          ? helmDetailRow(
              await call(api.helm.get({ clusterId, namespace: ref.namespace ?? "", name: ref.name })),
            )
          : await call(api.resources.get(ref));
      if (current !== gen.current) return;
      setObject(next);
      setError(null);
    } catch (fetchError) {
      if (current !== gen.current) return;
      setError(errorText(fetchError));
    } finally {
      if (current === gen.current) setLoading(false);
    }
  }, [clusterId, ref]);

  useEffect(() => {
    setObject(null);
    setError(null);
    void refresh();
    if (!refreshSeconds) return;
    const timer = window.setInterval(() => void refresh(), Math.max(5, refreshSeconds) * 1000);
    return () => window.clearInterval(timer);
  }, [refresh, refreshSeconds]);

  return { object, loading, error, refresh };
}

export function useEvents(
  clusterId: string,
  ref: ResourceKey | null,
  refreshSeconds: number,
  enabled = true,
): { events: KubeObject[]; loading: boolean; error: string | null } {
  const [events, setEvents] = useState<KubeObject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ref || !enabled) return;
    let disposed = false;
    const load = async () => {
      setLoading(true);
      try {
        const result = await call(
          api.resources.list({
            clusterId,
            apiVersion: "v1",
            kind: "Event",
            namespace: ref.namespace,
            fieldSelector: `involvedObject.kind=${ref.kind},involvedObject.name=${ref.name}`,
            limit: 200,
          }),
        );
        if (disposed) return;
        const sorted = [...result.items].sort((a, b) => {
          const left = new Date((a as any).lastTimestamp ?? (a as any).eventTime ?? 0).getTime();
          const right = new Date((b as any).lastTimestamp ?? (b as any).eventTime ?? 0).getTime();
          return right - left;
        });
        setEvents(sorted);
        setError(null);
      } catch (fetchError) {
        if (!disposed) setError(errorText(fetchError));
      } finally {
        if (!disposed) setLoading(false);
      }
    };
    void load();
    if (!refreshSeconds) return () => { disposed = true; };
    const timer = window.setInterval(() => void load(), Math.max(5, refreshSeconds) * 1000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [clusterId, ref, refreshSeconds, enabled]);

  return { events, loading, error };
}

export interface ServiceEndpointsState {
  ready: string[];
  notReady: string[];
  loading: boolean;
  error: string | null;
  /** False when the Service has no Endpoints object at all. */
  exists: boolean;
}

/**
 * Addresses behind one Service, read from the core `Endpoints` object (the
 * same source the table's Endpoints column uses). Absent object = no backends,
 * which is a fact worth showing, not an error.
 */
export function useServiceEndpointsDetail(
  clusterId: string,
  namespace: string | undefined,
  name: string | undefined,
  refreshSeconds = 60,
): ServiceEndpointsState {
  const [state, setState] = useState<ServiceEndpointsState>({
    ready: [],
    notReady: [],
    loading: false,
    error: null,
    exists: false,
  });

  useEffect(() => {
    if (!namespace || !name) return;
    let disposed = false;
    const load = async () => {
      setState((current) => ({ ...current, loading: true }));
      try {
        const result = await call(
          api.resources.list({
            clusterId,
            apiVersion: "v1",
            kind: "Endpoints",
            namespace,
            fieldSelector: `metadata.name=${name}`,
            limit: 1,
          }),
        );
        if (disposed) return;
        const object = result.items[0];
        const subsets = ((object?.subsets ?? []) as Array<{
          addresses?: Array<{ ip?: string }>;
          notReadyAddresses?: Array<{ ip?: string }>;
        }>);
        const ready: string[] = [];
        const notReady: string[] = [];
        for (const subset of subsets) {
          for (const address of subset.addresses ?? []) if (address.ip) ready.push(address.ip);
          for (const address of subset.notReadyAddresses ?? []) if (address.ip) notReady.push(address.ip);
        }
        setState({ ready, notReady, loading: false, error: null, exists: Boolean(object) });
      } catch (fetchError) {
        if (!disposed) {
          setState({ ready: [], notReady: [], loading: false, error: errorText(fetchError), exists: false });
        }
      }
    };
    void load();
    if (!refreshSeconds) return () => { disposed = true; };
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, Math.max(30, refreshSeconds) * 1000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [clusterId, namespace, name, refreshSeconds]);

  return state;
}

export interface OwnerChainEntry {
  kind: string;
  apiVersion: string;
  name: string;
  namespace?: string;
  status?: { text: string; tone: string };
  /** Set when the owner itself could not be read (deleted, or RBAC denied). */
  note?: string;
}

const OWNER_CHAIN_MAX_LEVELS = 8;
const OWNER_CHAIN_MAX_FETCHES = 16;

/**
 * Walks owner references upward — owner, owner's owner, … — so the Details
 * tab can show the whole ownership chain as one column. Owners live in the
 * child's namespace (Kubernetes rejects cross-namespace owner references),
 * and the API ignores the namespace for cluster-scoped kinds anyway.
 */
export function useOwnerChain(
  clusterId: string,
  object: KubeObject | null,
  enabled = true,
): { levels: OwnerChainEntry[][]; loading: boolean; error: string | null } {
  const [levels, setLevels] = useState<OwnerChainEntry[][]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subject = object
    ? `${object.metadata?.uid ?? `${object.metadata?.namespace}/${object.metadata?.name}`}`
    : "";

  useEffect(() => {
    if (!enabled || !object) {
      setLevels([]);
      setError(null);
      return;
    }
    let disposed = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      const seen = new Set<string>();
      let fetches = 0;
      let frontier: Array<{ ref: { kind: string; apiVersion: string; name: string }; namespace?: string }> = (
        object.metadata?.ownerReferences ?? []
      ).map((owner) => ({ ref: owner, namespace: object.metadata?.namespace }));
      const collected: OwnerChainEntry[][] = [];

      while (frontier.length > 0 && collected.length < OWNER_CHAIN_MAX_LEVELS && fetches < OWNER_CHAIN_MAX_FETCHES) {
        const level: OwnerChainEntry[] = [];
        const next: typeof frontier = [];
        await Promise.all(
          frontier.map(async ({ ref, namespace }) => {
            const key = `${ref.apiVersion}|${ref.kind}|${namespace ?? ""}|${ref.name}`;
            if (seen.has(key)) return;
            seen.add(key);
            fetches += 1;
            try {
              const owner = await call(
                api.resources.get({
                  clusterId,
                  apiVersion: ref.apiVersion,
                  kind: ref.kind,
                  namespace,
                  name: ref.name,
                }),
              );
              if (disposed) return;
              const status = resourceStatus(owner, owner.kind ?? ref.kind);
              level.push({
                kind: ref.kind,
                apiVersion: ref.apiVersion,
                name: ref.name,
                namespace: owner.metadata?.namespace ?? namespace,
                status: { text: status.text, tone: status.tone },
              });
              for (const parent of owner.metadata?.ownerReferences ?? []) {
                next.push({ ref: parent, namespace: owner.metadata?.namespace });
              }
            } catch (fetchError) {
              if (disposed) return;
              const message = errorText(fetchError);
              level.push({
                kind: ref.kind,
                apiVersion: ref.apiVersion,
                name: ref.name,
                namespace,
                note: /not found|404/i.test(message) ? "Owner no longer exists" : message,
              });
            }
          }),
        );
        if (disposed) return;
        if (level.length > 0) {
          level.sort((left, right) => left.name.localeCompare(right.name));
          collected.push(level);
        }
        frontier = next;
      }
      if (!disposed) {
        setLevels(collected);
        setLoading(false);
      }
    };
    void load();
    return () => {
      disposed = true;
    };
    // The subject key changes whenever a different resource is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterId, subject, enabled]);

  return { levels, loading, error };
}

export interface RelatedItem {
  kind: string;
  apiVersion: string;
  namespace?: string;
  name: string;
  status?: { text: string; tone: string };
  relationship: string;
}

export interface RelatedGroup {
  title: string;
  items: RelatedItem[];
}

export interface RelatedResult {
  groups: RelatedGroup[];
  loading: boolean;
  error: string | null;
  warnings: string[];
}

function toItem(object: KubeObject, relationship: string): RelatedItem {
  const status = resourceStatus(object, object.kind);
  return {
    kind: object.kind,
    apiVersion: object.apiVersion,
    namespace: object.metadata?.namespace,
    name: object.metadata?.name,
    relationship,
    status: { text: status.text, tone: status.tone },
  };
}

function matchesSelector(labels: Record<string, string> | undefined, selector: Record<string, string>): boolean {
  if (!selector || Object.keys(selector).length === 0) return false;
  return Object.entries(selector).every(([key, value]) => labels?.[key] === value);
}

export function useRelatedResources(
  clusterId: string,
  ref: ResourceKey | null,
  object: KubeObject | null,
  enabled = true,
): RelatedResult {
  const [groups, setGroups] = useState<RelatedGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    if (!ref || !object || !enabled) {
      setGroups([]);
      setWarnings([]);
      return;
    }
    let disposed = false;
    const kind = ref.kind;
    const namespace = object.metadata?.namespace;

    const list = async (apiVersion: string, listKind: string, listNamespace?: string, fieldSelector?: string) => {
      try {
        const result = await call(
          api.resources.list({
            clusterId,
            apiVersion,
            kind: listKind,
            namespace: listNamespace,
            fieldSelector,
            limit: 1000,
          }),
        );
        return result.items.map((item) => ({
          ...item,
          kind: item.kind ?? listKind,
          apiVersion: item.apiVersion ?? apiVersion,
        }));
      } catch (listError) {
        const message = errorText(listError);
        setWarnings((current) => (current.includes(message) ? current : [...current, message]));
        return [];
      }
    };

    const load = async () => {
      setLoading(true);
      try {
        const output: RelatedGroup[] = [];
        const owners: RelatedItem[] = [];

        for (const owner of object.metadata?.ownerReferences ?? []) {
          owners.push({
            kind: owner.kind,
            apiVersion: owner.apiVersion,
            // Owner references do not carry a namespace: the owner may be
            // cluster-scoped even when the child is namespaced.
            namespace: undefined,
            name: owner.name,
            relationship: "owner",
            status: { text: "owner", tone: "info" },
          });
        }
        if (owners.length) output.push({ title: "Owners", items: owners });

        if (kind === "Pod") {
          const services = (await list("v1", "Service", namespace)).filter((service) =>
            matchesSelector(object.metadata?.labels, (service.spec as any)?.selector ?? {}),
          );
          if (services.length) output.push({ title: "Services", items: services.map((item) => toItem(item, "selects this pod")) });

          const configMaps = new Set<string>();
          const secrets = new Set<string>();
          for (const volume of (object.spec as any)?.volumes ?? []) {
            if (volume.configMap?.name) configMaps.add(volume.configMap.name);
            if (volume.secret?.secretName) secrets.add(volume.secret.secretName);
          }
          for (const container of [
            ...((object.spec as any)?.containers ?? []),
            ...((object.spec as any)?.initContainers ?? []),
          ]) {
            for (const env of container.envFrom ?? []) {
              if (env.configMapRef?.name) configMaps.add(env.configMapRef.name);
              if (env.secretRef?.name) secrets.add(env.secretRef.name);
            }
            for (const env of container.env ?? []) {
              if (env.valueFrom?.configMapKeyRef?.name) configMaps.add(env.valueFrom.configMapKeyRef.name);
              if (env.valueFrom?.secretKeyRef?.name) secrets.add(env.valueFrom.secretKeyRef.name);
            }
          }
          const referenced: RelatedItem[] = [];
          for (const name of configMaps) {
            referenced.push({ kind: "ConfigMap", apiVersion: "v1", namespace, name, relationship: "mounted / env", status: { text: "referenced", tone: "neutral" } });
          }
          for (const name of secrets) {
            referenced.push({ kind: "Secret", apiVersion: "v1", namespace, name, relationship: "mounted / env", status: { text: "referenced", tone: "neutral" } });
          }
          if (referenced.length) output.push({ title: "Referenced config", items: referenced });
        }

        if (["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job", "CronJob"].includes(kind)) {
          const selector = (object.spec as any)?.selector?.matchLabels ?? (object.spec as any)?.template?.metadata?.labels ?? {};
          if (Object.keys(selector).length) {
            const pods = (await list("v1", "Pod", namespace)).filter((pod) =>
              matchesSelector(pod.metadata?.labels, selector),
            );
            if (pods.length) output.push({ title: "Pods", items: pods.map((item) => toItem(item, "managed by this workload")) });
          }

          if (kind === "Deployment") {
            const replicaSets = (await list("apps/v1", "ReplicaSet", namespace)).filter((rs) =>
              (rs.metadata?.ownerReferences ?? []).some((owner) => owner.uid === object.metadata?.uid),
            );
            if (replicaSets.length) output.push({ title: "ReplicaSets", items: replicaSets.map((item) => toItem(item, "revision")) });
          }

          if (kind === "CronJob") {
            const jobs = (await list("batch/v1", "Job", namespace)).filter((job) =>
              (job.metadata?.ownerReferences ?? []).some((owner) => owner.uid === object.metadata?.uid),
            );
            if (jobs.length) output.push({ title: "Jobs", items: jobs.map((item) => toItem(item, "created by schedule")) });
          }
        }

        if (kind === "Service") {
          const selector = (object.spec as any)?.selector ?? {};
          if (Object.keys(selector).length) {
            const pods = (await list("v1", "Pod", namespace)).filter((pod) =>
              matchesSelector(pod.metadata?.labels, selector),
            );
            if (pods.length) output.push({ title: "Selected pods", items: pods.map((item) => toItem(item, "selected by service")) });
          }
        }

        if (kind === "Node") {
          const pods = await list("v1", "Pod", undefined, `spec.nodeName=${ref.name}`);
          if (pods.length) output.push({ title: "Pods on node", items: pods.map((item) => toItem(item, "scheduled here")) });
        }

        if (kind === "PersistentVolumeClaim") {
          const volumeName = (object.spec as any)?.volumeName;
          if (volumeName) {
            output.push({
              title: "Volume",
              items: [
                {
                  kind: "PersistentVolume",
                  apiVersion: "v1",
                  name: volumeName,
                  relationship: "bound volume",
                  status: { text: "bound", tone: "success" },
                },
              ],
            });
          }
        }

        if (!disposed) {
          setGroups(output);
          setError(null);
        }
      } catch (relatedError) {
        if (!disposed) setError(errorText(relatedError));
      } finally {
        if (!disposed) setLoading(false);
      }
    };

    void load();
    return () => {
      disposed = true;
    };
    // `resources` is intentionally excluded: discovery data doesn't change the relations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterId, ref, object, enabled]);

  return { groups, loading, error, warnings };
}
