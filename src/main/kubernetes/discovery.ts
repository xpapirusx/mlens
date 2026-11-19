import type { KubeConfig } from "@kubernetes/client-node";
import type { ApiResourceInfo, PrinterColumn } from "@shared/types";
import { kubeRequest } from "./http";
import { mapWithConcurrency } from "./concurrency";

interface RawApiResource {
  name: string;
  singularName?: string;
  namespaced: boolean;
  kind: string;
  verbs: string[];
  shortNames?: string[];
  categories?: string[];
}

interface RawApiResourceList {
  groupVersion: string;
  resources: RawApiResource[];
}

interface RawApiGroupList {
  groups: Array<{
    name: string;
    versions: Array<{ groupVersion: string; version: string }>;
    preferredVersion?: { groupVersion: string; version: string };
  }>;
}

interface RawCrd {
  metadata: { name: string };
  spec: {
    group: string;
    names: { plural: string; singular?: string; kind: string; shortNames?: string[]; categories?: string[] };
    scope: "Namespaced" | "Cluster";
    versions: Array<{
      name: string;
      served: boolean;
      storage: boolean;
      additionalPrinterColumns?: PrinterColumn[];
    }>;
  };
}

interface RawCrdList {
  items: RawCrd[];
}

const BUILTIN_GROUPS = new Set([
  "",
  "apps",
  "batch",
  "autoscaling",
  "policy",
  "networking.k8s.io",
  "rbac.authorization.k8s.io",
  "storage.k8s.io",
  "apiextensions.k8s.io",
  "apiregistration.k8s.io",
  "coordination.k8s.io",
  "discovery.k8s.io",
  "events.k8s.io",
  "flowcontrol.apiserver.k8s.io",
  "node.k8s.io",
  "scheduling.k8s.io",
  "certificates.k8s.io",
  "admissionregistration.k8s.io",
  "authentication.k8s.io",
  "authorization.k8s.io",
  "resource.k8s.io",
  "internal.apiserver.k8s.io",
  "storagemigration.k8s.io",
  "metrics.k8s.io",
  "custom.metrics.k8s.io",
  "external.metrics.k8s.io",
]);

const WORKLOAD_KINDS = new Set([
  "Pod",
  "Deployment",
  "StatefulSet",
  "DaemonSet",
  "ReplicaSet",
  "ReplicationController",
  "ControllerRevision",
  "Job",
  "CronJob",
]);

const NETWORK_KINDS = new Set([
  "Service",
  "Ingress",
  "IngressClass",
  "NetworkPolicy",
  "Endpoints",
  "EndpointSlice",
  "Gateway",
  "HTTPRoute",
  "GRPCRoute",
  "TCPRoute",
  "UDPRoute",
  "TLSRoute",
]);

const CONFIG_KINDS = new Set(["ConfigMap", "Secret", "LimitRange", "ResourceQuota", "PodTemplate"]);

const STORAGE_KINDS = new Set([
  "PersistentVolume",
  "PersistentVolumeClaim",
  "StorageClass",
  "CSIDriver",
  "CSINode",
  "VolumeAttachment",
  "CSIStorageCapacity",
]);

const ACCESS_KINDS = new Set([
  "ServiceAccount",
  "Role",
  "RoleBinding",
  "ClusterRole",
  "ClusterRoleBinding",
]);

const CLUSTER_KINDS = new Set([
  "Node",
  "Namespace",
  "Event",
  "ComponentStatus",
  "CustomResourceDefinition",
  "APIService",
  "Lease",
  "RuntimeClass",
  "PriorityClass",
  "MutatingWebhookConfiguration",
  "ValidatingWebhookConfiguration",
  "ValidatingAdmissionPolicy",
  "ValidatingAdmissionPolicyBinding",
  "CertificateSigningRequest",
  "FlowSchema",
  "PriorityLevelConfiguration",
]);

const SCALING_KINDS = new Set([
  "HorizontalPodAutoscaler",
  "PodDisruptionBudget",
  "VerticalPodAutoscaler",
]);

function categorize(kind: string, isCrd: boolean, group: string): string {
  if (isCrd) return `custom:${group || "core"}`;
  if (WORKLOAD_KINDS.has(kind)) return "workloads";
  if (NETWORK_KINDS.has(kind)) return "networking";
  if (CONFIG_KINDS.has(kind)) return "config";
  if (STORAGE_KINDS.has(kind)) return "storage";
  if (ACCESS_KINDS.has(kind)) return "access-control";
  if (CLUSTER_KINDS.has(kind)) return "cluster";
  if (SCALING_KINDS.has(kind)) return "scaling";
  return "other";
}

export class DiscoveryService {
  private cache: ApiResourceInfo[] | null = null;
  private cachedAt = 0;
  private inflight: Promise<ApiResourceInfo[]> | null = null;

  constructor(
    private readonly kc: KubeConfig,
    private readonly ttlMs = 5 * 60_000,
  ) {}

  async get(force = false): Promise<ApiResourceInfo[]> {
    if (!force && this.cache && Date.now() - this.cachedAt < this.ttlMs) return this.cache;
    if (this.inflight) return this.inflight;

    this.inflight = this.discover()
      .then((resources) => {
        this.cache = resources;
        this.cachedAt = Date.now();
        return resources;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  invalidate(): void {
    this.cache = null;
    this.cachedAt = 0;
  }

  private async discover(): Promise<ApiResourceInfo[]> {
    const resources: ApiResourceInfo[] = [];
    const seen = new Set<string>();

    const [core, groups, crds] = await Promise.all([
      kubeRequest<RawApiResourceList>(this.kc, "/api/v1"),
      kubeRequest<RawApiGroupList>(this.kc, "/apis").catch((error) => {
        console.warn("[discovery] /apis failed", error);
        return { groups: [] } as RawApiGroupList;
      }),
      kubeRequest<RawCrdList>(this.kc, "/apis/apiextensions.k8s.io/v1/customresourcedefinitions").catch(() => ({
        items: [] as RawCrd[],
      })),
    ]);

    const crdIndex = new Map<string, RawCrd>();
    for (const crd of crds.items ?? []) {
      crdIndex.set(`${crd.spec.group}/${crd.spec.names.plural}`, crd);
    }

    const add = (groupVersion: string, entry: RawApiResource) => {
      if (entry.name.includes("/")) return; // subresource
      if (!entry.verbs?.includes("list")) return;
      if (entry.kind.endsWith("List")) return;
      const group = groupVersion.includes("/") ? groupVersion.split("/")[0] : "";
      const version = groupVersion.includes("/") ? groupVersion.split("/")[1] : groupVersion;
      const key = `${group}/${entry.kind}`;
      if (seen.has(key)) return;
      seen.add(key);

      const crd = crdIndex.get(`${group}/${entry.name}`);
      const isCrd = crd !== undefined || !BUILTIN_GROUPS.has(group);
      const crdVersion = crd?.spec.versions.find((candidate) => candidate.name === version);
      const printerColumns = (crdVersion?.additionalPrinterColumns ?? [])
        .filter((column) => (column.priority ?? 0) === 0 || Boolean(column.jsonPath))
        .map((column) => ({
          name: column.name,
          type: column.type,
          jsonPath: column.jsonPath,
          description: column.description,
          priority: column.priority,
          format: column.format,
        }));

      resources.push({
        group,
        version,
        apiVersion: groupVersion,
        kind: entry.kind,
        plural: entry.name,
        singular: entry.singularName || entry.kind.toLowerCase(),
        namespaced: entry.namespaced,
        verbs: entry.verbs,
        shortNames: entry.shortNames ?? crd?.spec.names.shortNames ?? [],
        categories: entry.categories ?? [],
        isCrd,
        crdName: crd?.metadata.name,
        printerColumns,
        iconKey: entry.kind.toLowerCase(),
        catalogGroup: categorize(entry.kind, isCrd, group),
      });
    };

    for (const entry of core.resources ?? []) add(core.groupVersion || "v1", entry);

    // Bounded fan-out: clusters with 40–60 API groups used to fire that many
    // requests at once, each with its own connection setup.
    const groupResults = await mapWithConcurrency(groups.groups ?? [], 6, async (group) => {
      const preferred = group.preferredVersion ?? group.versions?.[0];
      if (!preferred) return null;
      try {
        return await kubeRequest<RawApiResourceList>(this.kc, `/apis/${preferred.groupVersion}`);
      } catch (error) {
        console.warn("[discovery] group failed", preferred.groupVersion, error);
        return null;
      }
    });

    for (const list of groupResults) {
      if (!list) continue;
      for (const entry of list.resources ?? []) add(list.groupVersion, entry);
    }

    return resources.sort((a, b) => {
      if (a.catalogGroup !== b.catalogGroup) return a.catalogGroup.localeCompare(b.catalogGroup);
      return a.kind.localeCompare(b.kind);
    });
  }
}
