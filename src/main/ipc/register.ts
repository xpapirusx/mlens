import electron from "electron";
import type { BrowserWindow as BrowserWindowType } from "electron";

const { app, BrowserWindow, dialog, ipcMain, shell } = electron;
import path from "node:path";
import type {
  ApplyYamlRequest,
  DeleteResourceRequest,
  ExecRequest,
  ListResourcesRequest,
  LocalTerminalRequest,
  LogRequest,
  PolicyResourceRequest,
  RbacRoleRequest,
  RbacSubjectRequest,
  HelmReleaseRequest,
  HelmReleasesRequest,
  HelmRollbackRequest,
  ResourceCountRequest,
  ResourceKey,
  RestartRequest,
  ScaleRequest,
  WatchEventBatch,
  WatchEventPayload,
  WatchResourcesRequest,
} from "@shared/types";
import { IPC } from "@shared/ipc";
import type { AppSettings } from "@shared/types";
import type { SettingsStore } from "../settings/store";
import type { KubeconfigManager } from "../kubernetes/kubeconfig";
import type { ClusterManager } from "../kubernetes/cluster-manager";
import type { PtyManager } from "../terminal/pty-manager";
import type { PortForwardManager } from "../kubernetes/port-forwards";

interface Dependencies {
  settings: SettingsStore;
  kubeconfigs: KubeconfigManager;
  clusters: ClusterManager;
  terminals: PtyManager;
  portForwards: PortForwardManager;
  getWindow: () => BrowserWindowType | null;
}

function assertString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${name} must be a non-empty string`);
  return value;
}

function assertObject<T>(value: unknown, name: string): T {
  if (!value || typeof value !== "object") throw new Error(`${name} must be an object`);
  return value as T;
}

/**
 * A3: coalesce watch events into one IPC message per ~150ms. One event used to
 * be one structured-clone + one React render of the whole workspace; bursts
 * (rolling deploys, namespace deletion) now cost a handful of renders instead
 * of hundreds. ERROR flips the badge immediately so status stays honest.
 */
class WatchEventBatcher {
  private readonly pending: WatchEventPayload[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly sendBatch: (batch: WatchEventBatch) => void) {}

  push(payload: WatchEventPayload): void {
    this.pending.push(payload);
    if (payload.type === "ERROR" || this.pending.length >= 250) {
      this.flush();
      return;
    }
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.flush();
      }, 150);
    }
  }

  private flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pending.length === 0) return;
    this.sendBatch({ events: this.pending.splice(0, this.pending.length) });
  }
}

export function registerIpc({ settings, kubeconfigs, clusters, terminals, portForwards, getWindow }: Dependencies): void {
  const send = (channel: string, payload: unknown): void => {
    const window = getWindow();
    if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
  };

  const watchBatcher = new WatchEventBatcher((batch) => send(IPC.resourcesWatchEvent, batch));

  const windowFor = (event: Electron.IpcMainInvokeEvent): BrowserWindowType | null =>
    BrowserWindow.fromWebContents(event.sender) ?? getWindow();

  // ── App / window ──────────────────────────────────────────────
  ipcMain.handle(IPC.appInfo, () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
  }));

  ipcMain.handle(IPC.appOpenExternal, async (_event, url: unknown) => {
    const target = assertString(url, "url");
    if (!/^https?:\/\//i.test(target)) throw new Error("Only http(s) links can be opened externally");
    await shell.openExternal(target);
  });

  ipcMain.handle(IPC.appMinimize, (event) => windowFor(event)?.minimize());
  ipcMain.handle(IPC.appMaximize, (event) => {
    const window = windowFor(event);
    if (!window) return;
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  });
  ipcMain.handle(IPC.appClose, (event) => windowFor(event)?.close());
  ipcMain.handle(IPC.appIsMaximized, (event) => windowFor(event)?.isMaximized() ?? false);

  // ── Kubeconfig catalog ────────────────────────────────────────
  ipcMain.handle(IPC.kubeconfigList, () => ({
    sources: kubeconfigs.listSources(),
    clusters: kubeconfigs.listClusters(),
  }));

  ipcMain.handle(IPC.kubeconfigAddDialog, async () => {
    const window = getWindow();
    const options: Electron.OpenDialogOptions = {
      title: "Import kubeconfig",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Kubeconfig", extensions: ["yaml", "yml", "conf", "kubeconfig"] },
        { name: "All files", extensions: ["*"] },
      ],
    };
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    if (result.canceled) return { canceled: true, paths: [] };

    const added: string[] = [];
    for (const file of result.filePaths) {
      const source = kubeconfigs.addPath(file);
      added.push(source.path);
    }
    return { canceled: false, paths: added };
  });

  ipcMain.handle(IPC.kubeconfigAddPath, (_event, path: unknown) => kubeconfigs.addPath(assertString(path, "path")));

  ipcMain.handle(IPC.kubeconfigAddContent, (_event, content: unknown, fileName: unknown) =>
    kubeconfigs.addContent(
      assertString(content, "kubeconfig content"),
      path.join(app.getPath("userData"), "kubeconfigs"),
      typeof fileName === "string" ? fileName : undefined,
    ),
  );

  ipcMain.handle(IPC.kubeconfigRemove, async (_event, path: unknown) => {
    const target = assertString(path, "path");
    for (const cluster of kubeconfigs.listClusters()) {
      if (cluster.kubeconfigPath === target && clusters.isConnected(cluster.id)) {
        await clusters.disconnect(cluster.id);
      }
    }
    kubeconfigs.removePath(target);
  });

  // ── Cluster sessions ──────────────────────────────────────────
  ipcMain.handle(IPC.clusterConnect, (_event, id: unknown) => clusters.connect(assertString(id, "cluster id")));
  ipcMain.handle(IPC.clusterDisconnect, async (_event, id: unknown) => {
    const clusterId = assertString(id, "cluster id");
    portForwards.stopCluster(clusterId);
    await clusters.disconnect(clusterId);
  });
  ipcMain.handle(IPC.clusterHealth, (_event, id: unknown) => clusters.health(assertString(id, "cluster id")));
  ipcMain.handle(IPC.clusterNamespaces, (_event, id: unknown) => clusters.namespaces(assertString(id, "cluster id")));

  // ── Resources ─────────────────────────────────────────────────
  ipcMain.handle(IPC.resourcesDiscover, (_event, clusterId: unknown) =>
    clusters.connection(assertString(clusterId, "cluster id")).catalog.refresh(),
  );

  ipcMain.handle(IPC.resourcesList, (_event, raw: unknown) =>
    clusters.list(assertObject<ListResourcesRequest>(raw, "request")),
  );
  ipcMain.handle(IPC.resourcesGet, (_event, raw: unknown) =>
    clusters.get(assertObject<ResourceKey>(raw, "request")),
  );
  ipcMain.handle(IPC.resourcesWatch, (_event, raw: unknown) =>
    clusters.watcher.start(assertObject<WatchResourcesRequest>(raw, "request"), (payload) =>
      watchBatcher.push(payload),
    ),
  );
  ipcMain.handle(IPC.resourcesUnwatch, (_event, id: unknown) => {
    clusters.watcher.stop(assertString(id, "subscription id"));
  });
  ipcMain.handle(IPC.resourcesCounts, (_event, raw: unknown) =>
    clusters.counts(assertObject<ResourceCountRequest>(raw, "request")),
  );
  ipcMain.handle(IPC.resourcesDelete, (_event, raw: unknown) =>
    clusters.remove(assertObject<DeleteResourceRequest>(raw, "request")),
  );
  ipcMain.handle(IPC.resourcesPatch, (_event, raw: unknown) =>
    clusters.patch(assertObject<import("@shared/types").PatchResourceRequest>(raw, "request")),
  );
  ipcMain.handle(IPC.resourcesApply, (_event, raw: unknown) =>
    clusters.apply(assertObject<ApplyYamlRequest>(raw, "request")),
  );
  ipcMain.handle(IPC.resourcesScale, (_event, raw: unknown) =>
    clusters.scale(assertObject<ScaleRequest>(raw, "request")),
  );
  ipcMain.handle(IPC.resourcesRestart, (_event, raw: unknown) =>
    clusters.restart(assertObject<RestartRequest>(raw, "request")),
  );
  ipcMain.handle(IPC.resourcesEvict, (_event, raw: unknown) =>
    clusters.evict(assertObject<import("@shared/types").EvictPodRequest>(raw, "request")),
  );

  ipcMain.handle(IPC.portForwardStart, (_event, raw: unknown) => {
    const request = assertObject<import("@shared/types").PortForwardRequest>(raw, "request");
    if (!Number.isInteger(request.remotePort) || request.remotePort <= 0 || request.remotePort > 65535) {
      throw new Error("Remote port must be between 1 and 65535");
    }
    if (request.localPort !== undefined && (!Number.isInteger(request.localPort) || request.localPort < 0 || request.localPort > 65535)) {
      throw new Error("Local port must be between 0 and 65535");
    }
    return portForwards.start(request);
  });
  ipcMain.handle(IPC.portForwardStop, (_event, id: unknown) => portForwards.stop(assertString(id, "port forward id")));
  ipcMain.handle(IPC.portForwardList, () => portForwards.list());

  ipcMain.handle(IPC.podContainers, (_event, clusterId: unknown, namespace: unknown, name: unknown) =>
    clusters.podContainers(
      assertString(clusterId, "cluster id"),
      assertString(namespace, "namespace"),
      assertString(name, "name"),
    ),
  );

  ipcMain.handle(IPC.rbacSubject, (_event, raw: unknown) =>
    clusters.rbacSubject(assertObject<RbacSubjectRequest>(raw, "request")),
  );

  ipcMain.handle(IPC.rbacRole, (_event, raw: unknown) =>
    clusters.rbacRole(assertObject<RbacRoleRequest>(raw, "request")),
  );

  ipcMain.handle(IPC.policyResource, (_event, raw: unknown) =>
    clusters.policyResource(assertObject<PolicyResourceRequest>(raw, "request")),
  );

  ipcMain.handle(IPC.helmList, (_event, raw: unknown) =>
    clusters.helmReleases(assertObject<HelmReleasesRequest>(raw, "request")),
  );

  ipcMain.handle(IPC.helmGet, (_event, raw: unknown) =>
    clusters.helmRelease(assertObject<HelmReleaseRequest>(raw, "request")),
  );

  ipcMain.handle(IPC.helmRollback, (_event, raw: unknown) =>
    clusters.helmRollback(assertObject<HelmRollbackRequest>(raw, "request")),
  );

  // ── Logs ──────────────────────────────────────────────────────
  ipcMain.handle(IPC.logsStart, (_event, raw: unknown) =>
    clusters.logs.start(
      assertObject<LogRequest>(raw, "request"),
      (payload) => send(IPC.logsChunk, payload),
      (payload) => send(IPC.logsEnd, payload),
    ),
  );
  ipcMain.handle(IPC.logsStop, (_event, id: unknown) => clusters.logs.stop(assertString(id, "stream id")));

  // ── Pod exec ──────────────────────────────────────────────────
  ipcMain.handle(IPC.execStart, (_event, raw: unknown) =>
    clusters.exec.start(
      assertObject<ExecRequest>(raw, "request"),
      (payload) => send(IPC.execData, payload),
      (payload) => send(IPC.execExit, payload),
    ),
  );
  ipcMain.handle(IPC.execInput, (_event, id: unknown, data: unknown) =>
    clusters.exec.input(assertString(id, "session id"), String(data ?? "")),
  );
  ipcMain.handle(IPC.execResize, (_event, id: unknown, cols: unknown, rows: unknown) =>
    clusters.exec.resize(assertString(id, "session id"), Number(cols) || 80, Number(rows) || 24),
  );
  ipcMain.handle(IPC.execClose, (_event, id: unknown) => clusters.exec.close(String(id)));

  // ── Local terminals ───────────────────────────────────────────
  ipcMain.handle(IPC.terminalCreate, (_event, raw: unknown) => {
    const request = assertObject<LocalTerminalRequest>(raw, "request");
    if (request.clusterId) {
      const kubeconfigPath = kubeconfigs.writeTerminalKubeconfig(
        request.clusterId,
        path.join(app.getPath("userData"), "terminal-kubeconfigs"),
        request.namespace,
      );
      request.env = {
        ...request.env,
        KUBECONFIG: kubeconfigPath,
        MLENS_CLUSTER: request.clusterId,
        ...(request.namespace ? { MLENS_NAMESPACE: request.namespace } : {}),
      };
    }
    return terminals.create(
      request,
      (payload) => send(IPC.terminalData, payload),
      (payload) => send(IPC.terminalExit, payload),
    );
  });
  ipcMain.handle(IPC.terminalInput, (_event, id: unknown, data: unknown) =>
    terminals.input(assertString(id, "session id"), String(data ?? "")),
  );
  ipcMain.handle(IPC.terminalResize, (_event, id: unknown, cols: unknown, rows: unknown) =>
    terminals.resize(assertString(id, "session id"), Number(cols) || 80, Number(rows) || 24),
  );
  ipcMain.handle(IPC.terminalClose, (_event, id: unknown) => terminals.close(String(id)));

  // ── Settings ──────────────────────────────────────────────────
  ipcMain.handle(IPC.settingsGet, () => settings.get());
  ipcMain.handle(IPC.settingsUpdate, (_event, raw: unknown) =>
    settings.update(assertObject<Partial<AppSettings>>(raw, "settings")),
  );
}
