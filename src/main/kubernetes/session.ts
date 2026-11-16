import type { KubeConfig } from "@kubernetes/client-node";
import type { ApiResourceInfo } from "@shared/types";
import { DiscoveryService } from "./discovery";

export class ResourceCatalog {
  private readonly byKind = new Map<string, ApiResourceInfo>();

  constructor(private readonly discovery: DiscoveryService) {}

  async refresh(force = false): Promise<ApiResourceInfo[]> {
    const resources = await this.discovery.get(force);
    this.byKind.clear();
    for (const resource of resources) {
      this.byKind.set(`${resource.apiVersion}|${resource.kind}`, resource);
      this.byKind.set(`${resource.apiVersion}|${resource.kind.toLowerCase()}`, resource);
    }
    return resources;
  }

  async get(apiVersion: string, kind: string): Promise<ApiResourceInfo> {
    if (this.byKind.size === 0) await this.refresh();
    const found = this.byKind.get(`${apiVersion}|${kind}`) ?? this.byKind.get(`${apiVersion}|${kind.toLowerCase()}`);
    if (!found) {
      // Discovery may be stale (a CRD was just installed): retry once.
      await this.refresh(true);
      const retried =
        this.byKind.get(`${apiVersion}|${kind}`) ?? this.byKind.get(`${apiVersion}|${kind.toLowerCase()}`);
      if (retried) return retried;
      throw new Error(`Resource ${apiVersion}/${kind} is not served by this cluster.`);
    }
    return found;
  }
}

export interface ClusterSessionInit {
  id: string;
  kubeConfig: KubeConfig;
}

export class ClusterConnection {
  readonly discovery: DiscoveryService;
  readonly catalog: ResourceCatalog;
  version = "unknown";
  gitVersion = "";
  latencyMs = 0;

  constructor(readonly id: string, readonly kc: KubeConfig) {
    this.discovery = new DiscoveryService(kc);
    this.catalog = new ResourceCatalog(this.discovery);
  }
}
