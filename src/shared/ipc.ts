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
  ClusterSummary,
  DeleteResourceRequest,
  EvictPodRequest,
  ExecRequest,
  HelmReleaseDetail,
  HelmReleaseRequest,
  HelmReleaseSummary,
  HelmReleasesRequest,
  HelmRollbackRequest,
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
  PolicyResourceRequest,
  PolicyResourceResponse,
  PortForwardInfo,
  PortForwardRequest,
  RbacSubjectRequest,
  RbacSubjectResponse,
  RbacRoleRequest,
  RbacRoleResponse,
  ResourceCountRequest,
  ResourceCountResult,
  ResourceKey,
  RestartRequest,
  ScaleRequest,
  TerminalDataPayload,
  TerminalExitPayload,
  WatchEventPayload,
  WatchResourcesRequest,
} from "./types";

/** Every IPC channel used by mLens, in one place. */
export const IPC = {
  appInfo: "app:info",
  appOpenExternal: "app:open-external",
  appMinimize: "app:window-minimize",
  appMaximize: "app:window-maximize",
  appClose: "app:window-close",
  appIsMaximized: "app:window-is-maximized",
  appWindowState: "app:window-state",

  kubeconfigList: "kube:config-list",
  kubeconfigAddDialog: "kube:config-add-dialog",
  kubeconfigAddPath: "kube:config-add-path",
  kubeconfigAddContent: "kube:config-add-content",
  kubeconfigRemove: "kube:config-remove",
  clusterConnect: "kube:cluster-connect",
  clusterDisconnect: "kube:cluster-disconnect",
  clusterHealth: "kube:cluster-health",
  clusterNamespaces: "kube:cluster-namespaces",

  resourcesDiscover: "kube:resources-discover",
  resourcesList: "kube:resources-list",
  resourcesGet: "kube:resources-get",
  resourcesWatch: "kube:resources-watch",
  resourcesUnwatch: "kube:resources-unwatch",
  resourcesCounts: "kube:resources-counts",
  resourcesDelete: "kube:resources-delete",
  resourcesPatch: "kube:resources-patch",
  resourcesApply: "kube:resources-apply",
  resourcesScale: "kube:resources-scale",
  resourcesRestart: "kube:resources-restart",
  resourcesEvict: "kube:resources-evict",
  resourcesWatchEvent: "kube:resources-watch-event",
  podContainers: "kube:pod-containers",
  rbacSubject: "kube:rbac-subject",
  rbacRole: "kube:rbac-role",
  policyResource: "kube:policy-resource",
  helmList: "kube:helm-list",
  helmGet: "kube:helm-get",
  helmRollback: "kube:helm-rollback",

  portForwardStart: "kube:portforward-start",
  portForwardStop: "kube:portforward-stop",
  portForwardList: "kube:portforward-list",

  logsStart: "kube:logs-start",
  logsStop: "kube:logs-stop",
  logsChunk: "kube:logs-chunk",
  logsEnd: "kube:logs-end",

  execStart: "kube:exec-start",
  execInput: "kube:exec-input",
  execResize: "kube:exec-resize",
  execClose: "kube:exec-close",
  execData: "kube:exec-data",
  execExit: "kube:exec-exit",

  terminalCreate: "terminal:create",
  terminalInput: "terminal:input",
  terminalResize: "terminal:resize",
  terminalClose: "terminal:close",
  terminalData: "terminal:data",
  terminalExit: "terminal:exit",

  settingsGet: "settings:get",
  settingsUpdate: "settings:update",
  settingsChanged: "settings:changed",
} as const;

export interface MlensApi {
  /** process.platform of the desktop process; used for native window chrome. */
  platform: string;
  app: {
    info(): Promise<AppInfo>;
    openExternal(url: string): Promise<void>;
    minimize(): Promise<void>;
    maximize(): Promise<void>;
    close(): Promise<void>;
    isMaximized(): Promise<boolean>;
    onWindowState(callback: (maximized: boolean) => void): () => void;
  };
  clusters: {
    listKubeconfigs(): Promise<{ sources: KubeconfigSource[]; clusters: ClusterSummary[] }>;
    addKubeconfigDialog(): Promise<AddKubeconfigResult>;
    addKubeconfigPath(path: string): Promise<KubeconfigSource>;
    addKubeconfigContent(content: string, fileName?: string): Promise<KubeconfigSource>;
    removeKubeconfig(path: string): Promise<void>;
    connect(id: ClusterId): Promise<ClusterConnectionInfo>;
    disconnect(id: ClusterId): Promise<void>;
    health(id: ClusterId): Promise<ClusterHealth>;
    namespaces(id: ClusterId): Promise<NamespaceInfo[]>;
  };
  resources: {
    discover(clusterId: ClusterId): Promise<ApiResourceInfo[]>;
    list(request: ListResourcesRequest): Promise<ListResourcesResult>;
    get(request: ResourceKey): Promise<KubeObject>;
    watch(request: WatchResourcesRequest): Promise<void>;
    unwatch(subscriptionId: string): Promise<void>;
    counts(request: ResourceCountRequest): Promise<ResourceCountResult[]>;
    delete(request: DeleteResourceRequest): Promise<void>;
    patch(request: PatchResourceRequest): Promise<KubeObject>;
    apply(request: ApplyYamlRequest): Promise<ApplyYamlResult[]>;
    scale(request: ScaleRequest): Promise<void>;
    restart(request: RestartRequest): Promise<void>;
    evict(request: EvictPodRequest): Promise<void>;
    onWatchEvent(callback: (event: WatchEventPayload) => void): () => void;
  };
  pods: {
    containers(clusterId: ClusterId, namespace: string, name: string): Promise<PodContainerInfo[]>;
  };
  rbac: {
    /** Effective permissions of a ServiceAccount (direct + group-inherited). */
    subject(request: RbacSubjectRequest): Promise<RbacSubjectResponse>;
    /** Bindings that reference one Role/ClusterRole, plus its rules. */
    role(request: RbacRoleRequest): Promise<RbacRoleResponse>;
  };
  policy: {
    /** Policy-report findings for one resource; `not_installed` when no engine exists. */
    resource(request: PolicyResourceRequest): Promise<PolicyResourceResponse>;
  };
  helm: {
    /** Releases parsed from the `owner=helm` secrets (no Helm binary). */
    list(request: HelmReleasesRequest): Promise<HelmReleaseSummary[]>;
    /** One release with its values, manifests, revisions and created resources. */
    get(request: HelmReleaseRequest & { revision?: number }): Promise<HelmReleaseDetail>;
    /** Re-applies an older revision's manifest and records a new revision. */
    rollback(request: HelmRollbackRequest): Promise<HelmReleaseDetail>;
  };
  portForward: {
    start(request: PortForwardRequest): Promise<PortForwardInfo>;
    stop(id: string): Promise<void>;
    list(): Promise<PortForwardInfo[]>;
  };
  logs: {
    start(request: LogRequest): Promise<void>;
    stop(streamId: string): Promise<void>;
    onChunk(callback: (payload: LogChunkPayload) => void): () => void;
    onEnd(callback: (payload: LogEndPayload) => void): () => void;
  };
  exec: {
    start(request: ExecRequest): Promise<void>;
    input(sessionId: string, data: string): Promise<void>;
    resize(sessionId: string, cols: number, rows: number): Promise<void>;
    close(sessionId: string): Promise<void>;
    onData(callback: (payload: TerminalDataPayload) => void): () => void;
    onExit(callback: (payload: TerminalExitPayload) => void): () => void;
  };
  terminal: {
    create(request: LocalTerminalRequest): Promise<{ shell: string }>;
    input(sessionId: string, data: string): Promise<void>;
    resize(sessionId: string, cols: number, rows: number): Promise<void>;
    close(sessionId: string): Promise<void>;
    onData(callback: (payload: TerminalDataPayload) => void): () => void;
    onExit(callback: (payload: TerminalExitPayload) => void): () => void;
  };
  settings: {
    get(): Promise<AppSettings>;
    update(patch: Partial<AppSettings>): Promise<AppSettings>;
    onChanged(callback: (settings: AppSettings) => void): () => void;
  };
}
