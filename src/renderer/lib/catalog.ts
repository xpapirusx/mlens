import {
  Boxes,
  Cpu,
  HardDrive,
  Network,
  Puzzle,
  Scaling,
  ShieldCheck,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import type { ApiResourceInfo } from "@shared/types";

export interface CategoryMeta {
  id: string;
  title: string;
  icon: LucideIcon;
  order: number;
}

/**
 * Freelens-style top-level order. Custom Resources live under one parent group
 * with each CRD API group nested inside it.
 */
export const CATEGORIES: CategoryMeta[] = [
  { id: "cluster", title: "Cluster", icon: Cpu, order: 10 },
  { id: "workloads", title: "Workloads", icon: Boxes, order: 20 },
  { id: "config", title: "Config", icon: SlidersHorizontal, order: 30 },
  { id: "networking", title: "Network", icon: Network, order: 40 },
  { id: "storage", title: "Storage", icon: HardDrive, order: 50 },
  { id: "access-control", title: "Access Control", icon: ShieldCheck, order: 60 },
  { id: "scaling", title: "Scaling", icon: Scaling, order: 70 },
  { id: "other", title: "Other", icon: Puzzle, order: 80 },
];

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

const KIND_ORDER: Record<string, number> = {
  Node: 10,
  Namespace: 20,
  Event: 30,
  Lease: 40,
  PriorityClass: 50,
  RuntimeClass: 60,
  APIService: 70,
  CustomResourceDefinition: 80,
  MutatingWebhookConfiguration: 90,
  ValidatingWebhookConfiguration: 100,
  Pod: 10,
  Deployment: 20,
  StatefulSet: 30,
  DaemonSet: 40,
  ReplicaSet: 50,
  ReplicationController: 55,
  Job: 60,
  CronJob: 70,
  Service: 10,
  Ingress: 20,
  IngressClass: 25,
  NetworkPolicy: 30,
  Endpoints: 40,
  EndpointSlice: 50,
  Gateway: 60,
  HTTPRoute: 70,
  ConfigMap: 10,
  Secret: 20,
  ResourceQuota: 30,
  LimitRange: 40,
  PodTemplate: 50,
  PersistentVolumeClaim: 10,
  PersistentVolume: 20,
  StorageClass: 30,
  CSIDriver: 40,
  CSINode: 50,
  VolumeAttachment: 60,
  CSIStorageCapacity: 70,
  ServiceAccount: 10,
  Role: 20,
  RoleBinding: 30,
  ClusterRole: 40,
  ClusterRoleBinding: 50,
  HorizontalPodAutoscaler: 10,
  VerticalPodAutoscaler: 20,
  PodDisruptionBudget: 30,
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
  /** Count of all resources below this group (leaf or tree). */
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

export function buildResourceGroups(resources: ApiResourceInfo[]): ResourceGroup[] {
  const builtIn = new Map<string, ResourceGroup>();
  const customGroups = new Map<string, ResourceGroup>();

  for (const resource of resources) {
    if (!isListable(resource)) continue;

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
      CATEGORIES.find((category) => category.id === "other")!;
    if (!builtIn.has(meta.id)) {
      builtIn.set(meta.id, {
        id: meta.id,
        title: meta.title,
        icon: meta.icon,
        order: meta.order,
        resources: [],
        total: 0,
      });
    }
    builtIn.get(meta.id)!.resources.push(resource);
  }

  for (const group of builtIn.values()) {
    group.resources = sortResources(group.resources);
    group.total = group.resources.length;
  }

  const custom = [...customGroups.values()]
    .map((group) => ({
      ...group,
      resources: sortResources(group.resources),
      total: group.resources.length,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));

  const result = [...builtIn.values()]
    .filter((group) => group.resources.length > 0)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

  if (custom.length > 0) {
    result.push({
      id: "custom",
      title: "Custom Resources",
      icon: Puzzle,
      order: 110,
      resources: [],
      children: custom,
      total: custom.reduce((sum, group) => sum + group.total, 0),
    });
  }

  return result;
}

function flatten(group: ResourceGroup): ApiResourceInfo[] {
  return [...group.resources, ...(group.children ?? []).flatMap(flatten)];
}

export function siblingResources(
  groups: ResourceGroup[],
  selected: { apiVersion: string; kind: string } | null,
): ApiResourceInfo[] {
  if (!selected) return [];
  for (const group of groups) {
    const all = flatten(group);
    if (all.some((resource) => resource.apiVersion === selected.apiVersion && resource.kind === selected.kind)) {
      return all;
    }
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

export function filterGroups(groups: ResourceGroup[], search: string): ResourceGroup[] {
  const term = search.trim().toLowerCase();
  if (!term) return groups;

  return groups
    .map((group) => {
      if (group.children) {
        const children = group.children
          .map((child) => ({
            ...child,
            resources: child.resources.filter(
              (resource) =>
                resource.kind.toLowerCase().includes(term) ||
                resource.plural.toLowerCase().includes(term) ||
                resource.shortNames.some((name) => name.toLowerCase().includes(term)),
            ),
          }))
          .filter((child) => child.resources.length > 0 || child.title.toLowerCase().includes(term));
        const matchesParent = group.title.toLowerCase().includes(term);
        return {
          ...group,
          children,
          resources: matchesParent ? group.resources : group.resources.filter(
            (resource) =>
              resource.kind.toLowerCase().includes(term) ||
              resource.plural.toLowerCase().includes(term) ||
              resource.shortNames.some((name) => name.toLowerCase().includes(term)),
          ),
          total: children.reduce((sum, child) => sum + child.resources.length, 0) +
            group.resources.filter((resource) =>
              resource.kind.toLowerCase().includes(term) ||
              resource.plural.toLowerCase().includes(term) ||
              resource.shortNames.some((name) => name.toLowerCase().includes(term)),
            ).length,
        };
      }
      return {
        ...group,
        resources: group.resources.filter(
          (resource) =>
            resource.kind.toLowerCase().includes(term) ||
            resource.plural.toLowerCase().includes(term) ||
            resource.shortNames.some((name) => name.toLowerCase().includes(term)),
        ),
        total: group.total,
      };
    })
    .filter((group) =>
      group.resources.length > 0 ||
      (group.children?.length ?? 0) > 0 ||
      group.title.toLowerCase().includes(term),
    );
}
