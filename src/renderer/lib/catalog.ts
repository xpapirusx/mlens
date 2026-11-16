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

export const CATEGORIES: CategoryMeta[] = [
  { id: "workloads", title: "Workloads", icon: Boxes, order: 10 },
  { id: "networking", title: "Network", icon: Network, order: 20 },
  { id: "config", title: "Configuration", icon: SlidersHorizontal, order: 30 },
  { id: "storage", title: "Storage", icon: HardDrive, order: 40 },
  { id: "access-control", title: "Access Control", icon: ShieldCheck, order: 50 },
  { id: "cluster", title: "Cluster", icon: Cpu, order: 60 },
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
  Pod: 10,
  Deployment: 20,
  StatefulSet: 30,
  DaemonSet: 40,
  ReplicaSet: 50,
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
  PersistentVolumeClaim: 10,
  PersistentVolume: 20,
  StorageClass: 30,
  CSIDriver: 40,
  CSINode: 50,
  ServiceAccount: 10,
  Role: 20,
  RoleBinding: 30,
  ClusterRole: 40,
  ClusterRoleBinding: 50,
  Node: 10,
  Namespace: 20,
  Event: 30,
  CustomResourceDefinition: 40,
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
    "gateway.networking.k8s.io": "Gateway API",
    "networking.istio.io": "Istio",
    "security.istio.io": "Istio Security",
    "monitoring.coreos.com": "Prometheus",
    "kube-prometheus-stack": "Prometheus",
    "velero.io": "Velero",
    "snapshot.storage.k8s.io": "Volume Snapshots",
    "keda.sh": "KEDA",
    "kyverno.io": "Kyverno",
    "crossplane.io": "Crossplane",
    "cluster.x-k8s.io": "Cluster API",
    "ray.io": "Ray",
    "kueue.x-k8s.io": "Kueue",
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
}

export function isListable(resource: ApiResourceInfo): boolean {
  return resource.verbs.includes("list") && !HIDDEN_KINDS.has(resource.kind) && resource.kind !== "Event";
}

export function buildResourceGroups(resources: ApiResourceInfo[]): ResourceGroup[] {
  const groups = new Map<string, ResourceGroup>();

  for (const resource of resources) {
    if (!isListable(resource)) continue;
    const meta = CATEGORIES.find((category) => category.id === resource.catalogGroup);
    const isCustom = resource.catalogGroup.startsWith("custom:");
    const customGroup = isCustom ? resource.catalogGroup.slice("custom:".length) : "";
    const id = isCustom ? `custom:${customGroup}` : resource.catalogGroup;
    const title = isCustom
      ? formatGroupName(customGroup)
      : (meta?.title ?? "Other");
    const icon = meta?.icon ?? Puzzle;
    const order = isCustom ? 1000 : (meta?.order ?? 900);

    if (!groups.has(id)) groups.set(id, { id, title, icon, order, resources: [] });
    groups.get(id)!.resources.push(resource);
  }

  // Always expose Events under Cluster even though it is filtered from the
  // generic list (deduped events.k8s.io vs core v1 in buildResourceGroups).
  const eventResource = resources.find((resource) => resource.kind === "Event" && resource.apiVersion === "v1");
  if (eventResource) {
    const cluster = groups.get("cluster") ?? { id: "cluster", title: "Cluster", icon: Cpu, order: 60, resources: [] };
    if (!cluster.resources.some((entry) => entry.kind === "Event")) cluster.resources.push(eventResource);
    groups.set("cluster", cluster);
  }

  for (const group of groups.values()) {
    group.resources.sort((a, b) => {
      const aOrder = KIND_ORDER[a.kind] ?? 500;
      const bOrder = KIND_ORDER[b.kind] ?? 500;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.kind.localeCompare(b.kind);
    });
  }

  return [...groups.values()]
    .filter((group) => group.resources.length > 0)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

export function siblingResources(
  groups: ResourceGroup[],
  selected: { apiVersion: string; kind: string } | null,
): ApiResourceInfo[] {
  if (!selected) return [];
  const group = groups.find((entry) =>
    entry.resources.some((resource) => resource.apiVersion === selected.apiVersion && resource.kind === selected.kind),
  );
  return group?.resources ?? [];
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

/** Filters for the sidebar search box. */
export function filterGroups(groups: ResourceGroup[], search: string): ResourceGroup[] {
  const term = search.trim().toLowerCase();
  if (!term) return groups;
  return groups
    .map((group) => ({
      ...group,
      resources: group.resources.filter(
        (resource) =>
          resource.kind.toLowerCase().includes(term) ||
          resource.plural.toLowerCase().includes(term) ||
          resource.shortNames.some((name) => name.toLowerCase().includes(term)),
      ),
    }))
    .filter((group) => group.resources.length > 0 || group.title.toLowerCase().includes(term));
}
