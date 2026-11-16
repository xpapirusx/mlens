import { KubeConfig, dumpYaml } from "@kubernetes/client-node";
import { createHash } from "node:crypto";
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

  /**
   * Write a context-pinned kubeconfig for a local shell. The user's own file is
   * never modified: we export a copy with `current-context` (and optionally the
   * namespace) set to the mLens session.
   */
  writeTerminalKubeconfig(id: ClusterId, directory: string, namespace?: string): string {
    const resolved = this.resolve(id);
    const kubeConfig = resolved.kubeConfig;
    kubeConfig.makePathsAbsolute(path.dirname(resolved.kubeconfigPath));
    const context = kubeConfig.getContextObject(resolved.contextName);
    if (context && namespace) {
      // getContextObject returns the live object in `contexts`; mutating it is
      // enough. addContext() would throw a duplicate-context error.
      (context as { namespace?: string }).namespace = namespace;
    }
    const exported = JSON.parse(kubeConfig.exportConfig()) as Record<string, unknown>;
    const yaml = dumpYaml(exported);
    const hash = createHash("sha256").update(`${id}|${namespace ?? ""}`).digest("hex").slice(0, 16);
    fs.mkdirSync(directory, { recursive: true });
    const target = path.join(directory, `context-${hash}.yaml`);
    fs.writeFileSync(target, yaml, { mode: 0o600 });
    return target;
  }

  clearTerminalKubeconfigs(directory: string): void {
    try {
      fs.rmSync(directory, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }

  addContent(content: string, directory: string, fileName?: string): KubeconfigSource {
    if (!content.trim()) throw new Error("Kubeconfig content is empty.");
    const probe = new KubeConfig();
    probe.loadFromString(content, { onInvalidEntry: "throw" });
    if (probe.getContexts().length === 0) {
      throw new Error("The pasted kubeconfig does not define any contexts.");
    }

    fs.mkdirSync(directory, { recursive: true });
    const safeName = (fileName ?? "imported")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "imported";
    const target = path.join(directory, `${safeName}-${Date.now()}.yaml`);
    fs.writeFileSync(target, content, { mode: 0o600 });
    return this.addPath(target);
  }

  addPath(kubeconfigPath: string): KubeconfigSource {    const resolved = path.resolve(kubeconfigPath.replace(/^~(?=$|\/|\\)/, process.env.HOME ?? "~"));
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
