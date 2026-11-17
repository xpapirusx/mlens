import {
  Activity,
  Boxes,
  Braces,
  Cpu,
  FolderOpen,
  HardDrive,
  Network,
  Package,
  Puzzle,
  ShieldCheck,
  SlidersHorizontal,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ApiResourceInfo } from "@shared/types";

export interface CategoryMeta {
  id: string;
  title: string;
  icon: LucideIcon;
  order: number;
}

/** Top-level order of the Freelens sidebar (overview omitted). */
export const CATEGORIES: CategoryMeta[] = [

  { id: "events", title: "Events", icon: Activity, order: 70 },
  { id: "namespaces", title: "Namespaces", icon: FolderOpen, order: 60 },
  { id: "nodes", title: "Nodes", icon: Cpu, order: 10 },
  { id: "workloads", title: "Workloads", icon: Boxes, order: 20 },
  { id: "network", title: "Network", icon: Network, order: 40 },
  { id: "config", title: "Config", icon: SlidersHorizontal, order: 30 },
  { id: "control", title: "Control", icon: Wrench, order: 35 },
  { id: "storage", title: "Storage", icon: HardDrive, order: 50 },

  { id: "access-control", title: "User Management", icon: ShieldCheck, order: 80 },
  { id: "helm", title: "Helm", icon: Package, order: 85 },
];

/**
 * Helm releases are not API resources — the browser reads them from the
 * `owner=helm` secrets. The sidebar still shows them as a normal group, so
 * this synthetic entry is injected into the group build (and excluded from
 * `remainingItemCount` counts, which would query a kind that does not exist).
 */
export const HELM_RELEASES_RESOURCE: ApiResourceInfo = {
  group: "helm.sh",
  version: "v1",
  apiVersion: "helm.sh/v1",
  kind: "HelmRelease",
  plural: "helmreleases",
  singular: "helmrelease",
  namespaced: true,
  verbs: ["list"],
  shortNames: ["helm"],
  categories: [],
  isCrd: false,
  printerColumns: [],
  iconKey: "Package",
  catalogGroup: "helm",
};

const HIDDEN_KINDS = new Set([
  "PodMetrics",
  "NodeMetrics",
  "ComponentStatus",
  "TokenReview",
  "SubjectAccessReview",
  "SelfSubjectAccessReview",
  "SelfSubjectRulesReview",
  "LocalSubjectAccessReview",
  "SelfSubjectReview",
]);

const WORKLOAD_KINDS = new Set([
  "Pod",
  "Deployment",
  "DaemonSet",
  "StatefulSet",
  "ReplicaSet",
  "ReplicationController",
  "Job",
  "CronJob",
]);

/** Configuration and autoscaling kinds — the Config group. */
const CONFIG_KINDS = new Set([
  "ConfigMap",
  "Secret",
  "HorizontalPodAutoscaler",
  "VerticalPodAutoscaler",
  "PodDisruptionBudget",
  "PriorityClass",
  "PriorityLevelConfiguration",
  "RuntimeClass",
  "PodTemplate",
]);

/**
 * Cluster machinery that Config used to absorb: coordination leases, the
 * aggregated API surface, admission webhooks/policies, quotas and request
 * defaults. Split out so Config stays about workload configuration.
 */
const CONTROL_KINDS = new Set([
  "Lease",
  "APIService",
  "ControllerRevision",
  "CertificateSigningRequest",
  "FlowSchema",
  "ResourceQuota",
  "LimitRange",
  "MutatingWebhookConfiguration",
  "ValidatingWebhookConfiguration",
  "ValidatingAdmissionPolicy",
  "ValidatingAdmissionPolicyBinding",
  "MutatingAdmissionPolicy",
  "MutatingAdmissionPolicyBinding",
]);

const NETWORK_KINDS = new Set([
  "Service",
  "EndpointSlice",
  "Endpoints",
  "Ingress",
  "IngressClass",
  "NetworkPolicy",
]);

const STORAGE_KINDS = new Set([
  "PersistentVolumeClaim",
  "PersistentVolume",
  "StorageClass",
  "CSIDriver",
  "CSINode",
  "VolumeAttachment",
  "CSIStorageCapacity",
]);

const ACCESS_KINDS = new Set([
  "ServiceAccount",
  "ClusterRole",
  "Role",
  "ClusterRoleBinding",
  "RoleBinding",
]);

const KIND_ORDER: Record<string, number> = {
  Pod: 20,
  Deployment: 30,
  DaemonSet: 40,
  StatefulSet: 50,
  ReplicaSet: 60,
  ReplicationController: 61,
  Job: 70,
  CronJob: 80,

  // Config
  ConfigMap: 10,
  Secret: 20,
  HorizontalPodAutoscaler: 30,
  VerticalPodAutoscaler: 31,
  PodDisruptionBudget: 40,
  PodTemplate: 45,
  PriorityClass: 50,
  PriorityLevelConfiguration: 55,
  RuntimeClass: 60,

  // Control (cluster machinery)
  ResourceQuota: 10,
  LimitRange: 20,
  Lease: 30,
  APIService: 40,
  CertificateSigningRequest: 45,
  FlowSchema: 50,
  MutatingWebhookConfiguration: 60,
  ValidatingWebhookConfiguration: 61,
  MutatingAdmissionPolicy: 70,
  MutatingAdmissionPolicyBinding: 71,
  ValidatingAdmissionPolicy: 80,
  ValidatingAdmissionPolicyBinding: 81,
  ControllerRevision: 90,

  Service: 10,
  EndpointSlice: 20,
  Endpoints: 21,
  Ingress: 30,
  IngressClass: 31,
  NetworkPolicy: 40,

  PersistentVolumeClaim: 10,
  PersistentVolume: 20,
  StorageClass: 30,
  CSIDriver: 40,
  CSINode: 50,
  VolumeAttachment: 60,
  CSIStorageCapacity: 70,

  ServiceAccount: 10,
  ClusterRole: 20,
  Role: 30,
  ClusterRoleBinding: 40,
  RoleBinding: 50,
};

export function formatGroupName(group: string): string {
  const known: Record<string, string> = {
    "argoproj.io": "Argo",
    "fluxcd.io": "Flux",
    "helm.toolkit.fluxcd.io": "Flux / Helm",
    "kustomize.toolkit.fluxcd.io": "Flux / Kustomize",
    "source.toolkit.fluxcd.io": "Flux / Sources",
    "cert-manager.io": "cert-manager",
    "acme.cert-manager.io": "ACME (cert-manager)",
    "gateway.networking.k8s.io": "Gateway API",
    "networking.istio.io": "Istio",
    "security.istio.io": "Istio Security",
    "monitoring.coreos.com": "Prometheus",
    "velero.io": "Velero",
    "snapshot.storage.k8s.io": "Volume Snapshots",
    "keda.sh": "KEDA",
    "kyverno.io": "Kyverno",
    "crossplane.io": "Crossplane",
    "cluster.x-k8s.io": "Cluster API",
    "ray.io": "Ray",
    "kueue.x-k8s.io": "Kueue",
    "cilium.io": "Cilium",
    "opentelemetry.io": "OpenTelemetry",
  };
  if (known[group]) return known[group];
  const base = group.replace(/\.(io|com|org|dev|sh)$/, "");
  return base
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export interface ResourceGroup {
  id: string;
  title: string;
  icon: LucideIcon;
  order: number;
  resources: ApiResourceInfo[];
  children?: ResourceGroup[];
  /** A single top-level resource rendered as a direct clickable row (Nodes). */
  standalone?: boolean;
  total: number;
}

export function isListable(resource: ApiResourceInfo): boolean {
  if (!resource.verbs.includes("list")) return false;
  if (HIDDEN_KINDS.has(resource.kind)) return false;
  if (resource.group === "events.k8s.io" && resource.kind === "Event") return false;
  return true;
}

function kindOrder(kind: string): number {
  return KIND_ORDER[kind] ?? 500;
}

function sortResources(resources: ApiResourceInfo[]): ApiResourceInfo[] {
  return [...resources].sort((a, b) => {
    const order = kindOrder(a.kind) - kindOrder(b.kind);
    if (order !== 0) return order;
    return a.kind.localeCompare(b.kind);
  });
}

function makeGroup(meta: CategoryMeta): ResourceGroup {
  return { id: meta.id, title: meta.title, icon: meta.icon, order: meta.order, resources: [], total: 0 };
}

export function buildResourceGroups(resources: ApiResourceInfo[]): ResourceGroup[] {
  const byId = new Map<string, ResourceGroup>();
  for (const meta of CATEGORIES) {
    if (meta.id !== "nodes" && meta.id !== "namespaces" && meta.id !== "events") {
      byId.set(meta.id, makeGroup(meta));
    }
  }

  const customGroups = new Map<string, ResourceGroup>();
  let node: ApiResourceInfo | undefined;
  let namespace: ApiResourceInfo | undefined;
  let event: ApiResourceInfo | undefined;
  let crd: ApiResourceInfo | undefined;

  for (const resource of resources) {
    if (!isListable(resource)) continue;
    const kind = resource.kind;

    if (kind === "Node" && !resource.isCrd) { node = resource; continue; }
    if (kind === "Namespace" && !resource.isCrd) { namespace = resource; continue; }
    if (kind === "Event" && resource.apiVersion === "v1" && !resource.isCrd) { event = resource; continue; }
    if (kind === "CustomResourceDefinition" && !resource.isCrd) { crd = resource; continue; }

    if (resource.isCrd) {
      const groupName = resource.group || "core";
      const id = `custom:${groupName}`;
      if (!customGroups.has(id)) {
        customGroups.set(id, {
          id,
          title: formatGroupName(groupName),
          icon: Puzzle,
          order: 0,
          resources: [],
          total: 0,
        });
      }
      customGroups.get(id)!.resources.push(resource);
      continue;
    }

    const meta = CATEGORIES.find((category) => category.id === resource.catalogGroup) ??
      CATEGORIES.find((category) => category.id === "config")!;
    const id = WORKLOAD_KINDS.has(kind)
      ? "workloads"
      : CONFIG_KINDS.has(kind)
        ? "config"
        : CONTROL_KINDS.has(kind)
          ? "control"
          : NETWORK_KINDS.has(kind)
            ? "network"
            : STORAGE_KINDS.has(kind)
              ? "storage"
              : ACCESS_KINDS.has(kind)
                ? "access-control"
                : meta.id === "nodes" || meta.id === "namespaces" || meta.id === "events"
                  ? "config"
                  : meta.id;
    if (!byId.has(id)) byId.set(id, makeGroup(CATEGORIES.find((entry) => entry.id === id) ?? CATEGORIES[0]));
    byId.get(id)!.resources.push(resource);
  }

  const result: ResourceGroup[] = [];

  if (node) {
    result.push({
      id: "nodes",
      title: "Nodes",
      icon: Cpu,
      order: 10,
      resources: [node],
      standalone: true,
      total: 1,
    });
  }

  // The Helm group carries the synthetic release resource (see above); it has
  // to be in place before groups are collected below.
  byId.get("helm")?.resources.push(HELM_RELEASES_RESOURCE);

  for (const meta of CATEGORIES) {
    if (meta.id === "nodes" || meta.id === "namespaces" || meta.id === "events") continue;
    const group = byId.get(meta.id);
    if (!group || group.resources.length === 0) continue;
    group.resources = sortResources(group.resources);
    group.total = group.resources.length;
    result.push(group);
  }

  if (namespace) {
    result.push({
      id: "namespaces",
      title: "Namespaces",
      icon: FolderOpen,
      order: 60,
      resources: [namespace],
      standalone: true,
      total: 1,
    });
  }

  if (event) {
    result.push({
      id: "events",
      title: "Events",
      icon: Activity,
      order: 70,
      resources: [event],
      standalone: true,
      total: 1,
    });
  }

  const children = [...customGroups.values()]
    .map((group) => ({
      ...group,
      resources: sortResources(group.resources),
      total: group.resources.length,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));

  if (crd) {
    children.unshift({
      id: "custom:definitions",
      title: "Definitions",
      icon: Braces,
      order: 0,
      resources: [crd],
      total: 1,
    });
  }

  if (children.length > 0) {
    result.push({
      id: "custom",
      title: "Custom Resources",
      icon: Puzzle,
      order: 90,
      resources: [],
      children,
      total: children.reduce((sum, group) => sum + group.total, 0),
    });
  }

  return result.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

export function siblingResources(
  groups: ResourceGroup[],
  selected: { apiVersion: string; kind: string } | null,
): ApiResourceInfo[] {
  if (!selected) return [];
  const matches = (resources: ApiResourceInfo[]) =>
    resources.some(
      (resource) => resource.apiVersion === selected.apiVersion && resource.kind === selected.kind,
    );

  for (const group of groups) {
    if (group.children) {
      const child = group.children.find((entry) => matches(entry.resources));
      if (child) return child.resources;
      if (matches(group.resources)) return group.resources;
      continue;
    }
    if (matches(group.resources)) return group.resources;
  }
  return [];
}

export function findResource(
  resources: ApiResourceInfo[],
  selected: { apiVersion: string; kind: string } | null,
): ApiResourceInfo | undefined {
  if (!selected) return undefined;
  return resources.find(
    (resource) => resource.apiVersion === selected.apiVersion && resource.kind === selected.kind,
  );
}

/**
 * Applies a saved sidebar order while keeping categories the user has never
 * seen (one added by an update) at their default position instead of dropping
 * them after everything they saved. Ids that no longer exist are ignored.
 */
export function mergeGroupOrder(baseIds: string[], saved: string[]): string[] {
  // The saved order is the user's drag order — it must lead, minus ids that no
  // longer exist (a removed category).
  const result = saved.filter((id) => baseIds.includes(id));
  for (const id of baseIds.filter((entry) => !result.includes(entry))) {
    const canonical = baseIds.indexOf(id);
    let insertAt = 0;
    for (let index = canonical - 1; index >= 0; index -= 1) {
      const position = result.indexOf(baseIds[index]);
      if (position >= 0) {
        insertAt = position + 1;
        break;
      }
    }
    result.splice(insertAt, 0, id);
  }
  return result;
}

export function filterGroups(groups: ResourceGroup[], search: string): ResourceGroup[] {
  const term = search.trim().toLowerCase();
  if (!term) return groups;
  const matchesResource = (resource: ApiResourceInfo) =>
    resource.kind.toLowerCase().includes(term) ||
    resource.plural.toLowerCase().includes(term) ||
    resource.shortNames.some((name) => name.toLowerCase().includes(term));

  return groups
    .map((group) => {
      if (group.children) {
        const children = group.children
          .map((child) => ({
            ...child,
            resources: child.resources.filter(matchesResource),
          }))
          .filter((child) => child.resources.length > 0 || child.title.toLowerCase().includes(term));
        return {
          ...group,
          children,
          resources: group.resources.filter(matchesResource),
          total: children.reduce((sum, child) => sum + child.resources.length, 0) +
            group.resources.filter(matchesResource).length,
        };
      }
      const resources = group.resources.filter(matchesResource);
      return { ...group, resources, total: resources.length };
    })
    .filter((group) =>
      group.resources.length > 0 ||
      (group.children?.length ?? 0) > 0 ||
      group.title.toLowerCase().includes(term),
    );
}
