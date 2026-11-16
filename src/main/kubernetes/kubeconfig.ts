import { KubeConfig } from "@kubernetes/client-node";
import fs from "node:fs";
import path from "node:path";
import type { ClusterId, ClusterSummary, KubeconfigSource } from "@shared/types";
import type { SettingsStore } from "../settings/store";

const ID_SEPARATOR = "::";

export function makeClusterId(kubeconfigPath: string, contextName: string): ClusterId {
  return `${kubeconfigPath}${ID_SEPARATOR}${contextName}`;
}

export function splitClusterId(id: ClusterId): { kubeconfigPath: string; contextName: string } {
  const index = id.lastIndexOf(ID_SEPARATOR);
  if (index <= 0) throw new Error(`Invalid cluster id: ${id}`);
  return { kubeconfigPath: id.slice(0, index), contextName: id.slice(index + ID_SEPARATOR.length) };
}

export interface ResolvedKubeconfig {
  id: ClusterId;
  kubeconfigPath: string;
  contextName: string;
  kubeConfig: KubeConfig;
}

export class KubeconfigManager {
  constructor(private readonly settings: SettingsStore) {}

  readonly homeConfig = path.join(process.env.HOME ?? "", ".kube", "config");

  private paths(): string[] {
    return this.settings.get().kubeconfigPaths;
  }

  listSources(): KubeconfigSource[] {
    return this.paths().map((kubeconfigPath) => {
      let exists = false;
      try {
        exists = fs.statSync(kubeconfigPath).isFile();
      } catch {
        exists = false;
      }
      if (!exists) {
        return { path: kubeconfigPath, exists, contextCount: 0, isDefault: kubeconfigPath === this.homeConfig };
      }
      try {
        const kc = new KubeConfig();
        kc.loadFromFile(kubeconfigPath);
        return {
          path: kubeconfigPath,
          exists,
          contextCount: kc.getContexts().length,
          isDefault: kubeconfigPath === this.homeConfig,
        };
      } catch (error) {
        return {
          path: kubeconfigPath,
          exists,
          contextCount: 0,
          isDefault: kubeconfigPath === this.homeConfig,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
  }

  listClusters(): ClusterSummary[] {
    const clusters: ClusterSummary[] = [];
    for (const kubeconfigPath of this.paths()) {
      let kc: KubeConfig;
      try {
        kc = new KubeConfig();
        kc.loadFromFile(kubeconfigPath);
      } catch (error) {
        clusters.push({
          id: makeClusterId(kubeconfigPath, "<unreadable>"),
          name: path.basename(kubeconfigPath),
          context: "<unreadable>",
          kubeconfigPath,
          server: "",
          user: "",
          defaultNamespace: "default",
          isCurrentContext: false,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      const current = kc.getCurrentContext();
      for (const context of kc.getContexts()) {
        const cluster = kc.getCluster(context.cluster);
        clusters.push({
          id: makeClusterId(kubeconfigPath, context.name),
          name: context.name,
          context: context.name,
          kubeconfigPath,
          server: cluster?.server ?? "",
          user: context.user ?? "",
          defaultNamespace: context.namespace ?? "default",
          isCurrentContext: context.name === current,
        });
      }
    }

    return clusters.sort((a, b) => {
      if (a.isCurrentContext !== b.isCurrentContext) return a.isCurrentContext ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  resolve(id: ClusterId): ResolvedKubeconfig {
    const { kubeconfigPath, contextName } = splitClusterId(id);
    if (!this.paths().includes(kubeconfigPath)) {
      throw new Error("This kubeconfig is no longer part of the mLens catalog.");
    }
    if (!fs.existsSync(kubeconfigPath)) {
      throw new Error(`Kubeconfig not found: ${kubeconfigPath}`);
    }

    const kubeConfig = new KubeConfig();
    kubeConfig.loadFromFile(kubeconfigPath);
    if (!kubeConfig.getContextObject(contextName)) {
      throw new Error(`Context "${contextName}" was not found in ${kubeconfigPath}`);
    }
    kubeConfig.setCurrentContext(contextName);
    return { id, kubeconfigPath, contextName, kubeConfig };
  }

  addPath(kubeconfigPath: string): KubeconfigSource {
    const resolved = path.resolve(kubeconfigPath.replace(/^~(?=$|\/|\\)/, process.env.HOME ?? "~"));
    if (!fs.existsSync(resolved)) throw new Error(`File not found: ${resolved}`);
    const probe = new KubeConfig();
    probe.loadFromFile(resolved); // throws with a useful message for invalid YAML

    const paths = this.paths();
    if (!paths.includes(resolved)) {
      this.settings.update({ kubeconfigPaths: [...paths, resolved] });
    }
    return (
      this.listSources().find((source) => source.path === resolved) ?? {
        path: resolved,
        exists: true,
        contextCount: probe.getContexts().length,
        isDefault: resolved === this.homeConfig,
      }
    );
  }

  removePath(kubeconfigPath: string): void {
    const paths = this.paths().filter((entry) => entry !== kubeconfigPath);
    this.settings.update({ kubeconfigPaths: paths });
  }
}
