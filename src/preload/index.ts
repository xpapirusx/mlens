import { contextBridge, ipcRenderer } from "electron";
import { IPC, type MlensApi } from "@shared/ipc";
import type {
  AddKubeconfigResult,
  ApiResourceInfo,
  AppInfo,
  AppSettings,
  ApplyYamlRequest,
  ApplyYamlResult,
  ClusterConnectionInfo,
  ClusterHealth,
  ClusterId,
  DeleteResourceRequest,
  ExecRequest,
  PatchResourceRequest,
  KubeObject,
  KubeconfigSource,
  ListResourcesRequest,
  ListResourcesResult,
  LocalTerminalRequest,
  LogChunkPayload,
  LogEndPayload,
  LogRequest,
  NamespaceInfo,
  PodContainerInfo,
  PortForwardInfo,
  PortForwardRequest,
  ResourceCountRequest,
  ResourceCountResult,
  ResourceKey,
  EvictPodRequest,
  RestartRequest,
  ScaleRequest,
  TerminalDataPayload,
  TerminalExitPayload,
  WatchEventPayload,
  WatchResourcesRequest,
} from "@shared/types";

function on<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const api: MlensApi = {
  platform: process.platform,
  app: {
    info: () => ipcRenderer.invoke(IPC.appInfo) as Promise<AppInfo>,
    openExternal: (url) => ipcRenderer.invoke(IPC.appOpenExternal, url) as Promise<void>,
    minimize: () => ipcRenderer.invoke(IPC.appMinimize) as Promise<void>,
    maximize: () => ipcRenderer.invoke(IPC.appMaximize) as Promise<void>,
    close: () => ipcRenderer.invoke(IPC.appClose) as Promise<void>,
    isMaximized: () => ipcRenderer.invoke(IPC.appIsMaximized) as Promise<boolean>,
    onWindowState: (callback) => on<boolean>(IPC.appWindowState, callback),
  },
  clusters: {
    listKubeconfigs: () =>
      ipcRenderer.invoke(IPC.kubeconfigList) as Promise<{
        sources: KubeconfigSource[];
        clusters: import("@shared/types").ClusterSummary[];
      }>,
    addKubeconfigDialog: () => ipcRenderer.invoke(IPC.kubeconfigAddDialog) as Promise<AddKubeconfigResult>,
    addKubeconfigPath: (path) => ipcRenderer.invoke(IPC.kubeconfigAddPath, path) as Promise<KubeconfigSource>,
    addKubeconfigContent: (content, fileName) =>
      ipcRenderer.invoke(IPC.kubeconfigAddContent, content, fileName) as Promise<KubeconfigSource>,
    removeKubeconfig: (path) => ipcRenderer.invoke(IPC.kubeconfigRemove, path) as Promise<void>,
    connect: (id) => ipcRenderer.invoke(IPC.clusterConnect, id) as Promise<ClusterConnectionInfo>,
    disconnect: (id) => ipcRenderer.invoke(IPC.clusterDisconnect, id) as Promise<void>,
    health: (id) => ipcRenderer.invoke(IPC.clusterHealth, id) as Promise<ClusterHealth>,
    namespaces: (id) => ipcRenderer.invoke(IPC.clusterNamespaces, id) as Promise<NamespaceInfo[]>,
  },
  resources: {
    discover: (clusterId) => ipcRenderer.invoke(IPC.resourcesDiscover, clusterId) as Promise<ApiResourceInfo[]>,
    list: (request: ListResourcesRequest) =>
      ipcRenderer.invoke(IPC.resourcesList, request) as Promise<ListResourcesResult>,
    get: (request: ResourceKey) => ipcRenderer.invoke(IPC.resourcesGet, request) as Promise<KubeObject>,
    watch: (request: WatchResourcesRequest) => ipcRenderer.invoke(IPC.resourcesWatch, request) as Promise<void>,
    unwatch: (subscriptionId) => ipcRenderer.invoke(IPC.resourcesUnwatch, subscriptionId) as Promise<void>,
    counts: (request: ResourceCountRequest) =>
      ipcRenderer.invoke(IPC.resourcesCounts, request) as Promise<ResourceCountResult[]>,
    delete: (request: DeleteResourceRequest) => ipcRenderer.invoke(IPC.resourcesDelete, request) as Promise<void>,
    patch: (request: PatchResourceRequest) => ipcRenderer.invoke(IPC.resourcesPatch, request) as Promise<KubeObject>,
    apply: (request: ApplyYamlRequest) =>
      ipcRenderer.invoke(IPC.resourcesApply, request) as Promise<ApplyYamlResult[]>,
    scale: (request: ScaleRequest) => ipcRenderer.invoke(IPC.resourcesScale, request) as Promise<void>,
    restart: (request: RestartRequest) => ipcRenderer.invoke(IPC.resourcesRestart, request) as Promise<void>,
    evict: (request: EvictPodRequest) => ipcRenderer.invoke(IPC.resourcesEvict, request) as Promise<void>,
    onWatchEvent: (callback) => on<WatchEventPayload>(IPC.resourcesWatchEvent, callback),
  },
  pods: {
    containers: (clusterId: ClusterId, namespace: string, name: string) =>
      ipcRenderer.invoke(IPC.podContainers, clusterId, namespace, name) as Promise<PodContainerInfo[]>,
  },
  portForward: {
    start: (request: PortForwardRequest) =>
      ipcRenderer.invoke(IPC.portForwardStart, request) as Promise<PortForwardInfo>,
    stop: (id: string) => ipcRenderer.invoke(IPC.portForwardStop, id) as Promise<void>,
    list: () => ipcRenderer.invoke(IPC.portForwardList) as Promise<PortForwardInfo[]>,
  },
  logs: {
    start: (request: LogRequest) => ipcRenderer.invoke(IPC.logsStart, request) as Promise<void>,
    stop: (streamId) => ipcRenderer.invoke(IPC.logsStop, streamId) as Promise<void>,
    onChunk: (callback) => on<LogChunkPayload>(IPC.logsChunk, callback),
    onEnd: (callback) => on<LogEndPayload>(IPC.logsEnd, callback),
  },
  exec: {
    start: (request: ExecRequest) => ipcRenderer.invoke(IPC.execStart, request) as Promise<void>,
    input: (sessionId, data) => ipcRenderer.invoke(IPC.execInput, sessionId, data) as Promise<void>,
    resize: (sessionId, cols, rows) => ipcRenderer.invoke(IPC.execResize, sessionId, cols, rows) as Promise<void>,
    close: (sessionId) => ipcRenderer.invoke(IPC.execClose, sessionId) as Promise<void>,
    onData: (callback) => on<TerminalDataPayload>(IPC.execData, callback),
    onExit: (callback) => on<TerminalExitPayload>(IPC.execExit, callback),
  },
  terminal: {
    create: (request: LocalTerminalRequest) =>
      ipcRenderer.invoke(IPC.terminalCreate, request) as Promise<{ shell: string }>,
    input: (sessionId, data) => ipcRenderer.invoke(IPC.terminalInput, sessionId, data) as Promise<void>,
    resize: (sessionId, cols, rows) => ipcRenderer.invoke(IPC.terminalResize, sessionId, cols, rows) as Promise<void>,
    close: (sessionId) => ipcRenderer.invoke(IPC.terminalClose, sessionId) as Promise<void>,
    onData: (callback) => on<TerminalDataPayload>(IPC.terminalData, callback),
    onExit: (callback) => on<TerminalExitPayload>(IPC.terminalExit, callback),
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet) as Promise<AppSettings>,
    update: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch) as Promise<AppSettings>,
    onChanged: (callback) => on<AppSettings>(IPC.settingsChanged, callback),
  },
};

contextBridge.exposeInMainWorld("mlens", api);
