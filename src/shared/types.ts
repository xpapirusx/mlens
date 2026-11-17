/**
 * Shared domain types between the Electron main process and the renderer.
 * No Electron or Node imports are allowed in this file.
 */

export type ClusterId = string;
export type ThemeMode = "light" | "dark" | "system";
export type ColorTheme = "radar" | "dracula" | "freelens";

export interface KubeconfigSource {
  path: string;
  exists: boolean;
  contextCount: number;
  error?: string;
  isDefault: boolean;
}

export interface ClusterSummary {
  /** Stable id: `<kubeconfig path>::<context name>` */
  id: ClusterId;
  name: string;
  context: string;
  kubeconfigPath: string;
  server: string;
  user: string;
  defaultNamespace: string;
  isCurrentContext: boolean;
  error?: string;
}

export interface ClusterConnectionInfo {
  id: ClusterId;
  name: string;
  context: string;
  server: string;
  version: string;
  gitVersion?: string;
  namespaces: string[];
  defaultNamespace: string;
  user?: string;
  connectedAt: number;
}

export interface PrinterColumn {
  name: string;
  type: string;
  jsonPath?: string;
  description?: string;
  priority?: number;
  format?: string;
}

export interface ApiResourceInfo {
  /** Empty string for the core group. */
  group: string;
  version: string;
  apiVersion: string;
  kind: string;
  plural: string;
  singular: string;
  namespaced: boolean;
  verbs: string[];
  shortNames: string[];
  categories: string[];
  isCrd: boolean;
  crdName?: string;
  printerColumns: PrinterColumn[];
  iconKey: string;
  /**
   * Resource group used by the sidebar catalog. One of the built-in
   * categories or `custom` for discovered CRDs.
   */
  catalogGroup: string;
}

export interface KubeMetadata {
  name: string;
  namespace?: string;
  uid?: string;
  resourceVersion?: string;
  generation?: number;
  creationTimestamp?: string;
  deletionTimestamp?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  ownerReferences?: Array<{
    apiVersion: string;
    kind: string;
    name: string;
    uid: string;
    controller?: boolean;
  }>;
  managedFields?: unknown[];
  finalizers?: string[];
}

export interface KubeObject {
  apiVersion: string;
  kind: string;
  metadata: KubeMetadata;
  status?: Record<string, unknown>;
  spec?: Record<string, unknown>;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ResourceKey {
  clusterId: ClusterId;
  apiVersion: string;
  kind: string;
  namespace?: string;
  name: string;
}

export interface ListResourcesRequest {
  clusterId: ClusterId;
  apiVersion: string;
  kind: string;
  namespace?: string;
  labelSelector?: string;
  fieldSelector?: string;
  limit?: number;
  continueToken?: string;
}

export interface ListResourcesResult {
  items: KubeObject[];
  resourceVersion?: string;
  continueToken?: string;
  remainingItemCount?: number;
}

export interface WatchResourcesRequest {
  subscriptionId: string;
  clusterId: ClusterId;
  apiVersion: string;
  kind: string;
  namespace?: string;
  labelSelector?: string;
  fieldSelector?: string;
  resourceVersion?: string;
}

export type WatchEventType = "ADDED" | "MODIFIED" | "DELETED" | "BOOKMARK" | "ERROR";

export interface WatchEventPayload {
  subscriptionId: string;
  type: WatchEventType;
  object?: KubeObject;
  error?: string;
}

export interface ResourceCountRequest {
  clusterId: ClusterId;
  resources: Array<{ apiVersion: string; kind: string; namespace?: string }>;
}

export interface ResourceCountResult {
  key: string;
  count: number;
  /** True when the count is a lower bound (the API cut the list short). */
  atLeast?: boolean;
  error?: string;
}

export interface LogRequest {
  streamId: string;
  clusterId: ClusterId;
  namespace: string;
  pod: string;
  container: string;
  previous?: boolean;
  follow?: boolean;
  tailLines?: number;
  timestamps?: boolean;
}

export interface LogChunkPayload {
  streamId: string;
  chunk: string;
}

export interface LogEndPayload {
  streamId: string;
  error?: string;
}

export interface ExecRequest {
  sessionId: string;
  clusterId: ClusterId;
  namespace: string;
  pod: string;
  container: string;
  command: string[];
  tty: boolean;
  cols: number;
  rows: number;
}

export interface LocalTerminalRequest {
  sessionId: string;
  cwd?: string;
  shell?: string;
  cols: number;
  rows: number;
  env?: Record<string, string>;
  /** When set, the shell receives a per-cluster KUBECONFIG. */
  clusterId?: ClusterId;
  /** Optional namespace override baked into that kubeconfig context. */
  namespace?: string;
}

export interface TerminalDataPayload {
  sessionId: string;
  data: string;
}

export interface TerminalExitPayload {
  sessionId: string;
  exitCode: number | null;
  error?: string;
}

export interface PodContainerInfo {
  name: string;
  image: string;
  ready: boolean;
  restartCount: number;
  state: string;
  startedAt?: string;
}

export interface PodSummary {
  namespace: string;
  name: string;
  phase: string;
  nodeName?: string;
  podIP?: string;
  containers: PodContainerInfo[];
}

export interface ApplyYamlRequest {
  clusterId: ClusterId;
  yaml: string;
  dryRun?: boolean;
}

export interface ApplyYamlResult {
  kind: string;
  name: string;
  namespace?: string;
  action: "created" | "updated";
}

export interface DeleteResourceRequest extends ResourceKey {
  propagationPolicy?: "Foreground" | "Background" | "Orphan";
}

export interface ScaleRequest {
  clusterId: ClusterId;
  apiVersion: string;
  kind: string;
  namespace: string;
  name: string;
  replicas: number;
}

export interface RestartRequest {
  clusterId: ClusterId;
  apiVersion: string;
  kind: string;
  namespace: string;
  name: string;
}

export interface ClusterHealth {
  id: ClusterId;
  status: "connected" | "connecting" | "disconnected" | "error";
  error?: string;
  checkedAt?: number;
  latencyMs?: number;
}

export interface AppSettings {
  theme: ThemeMode;
  colorTheme: ColorTheme;
  kubeconfigPaths: string[];
  favorites: ClusterId[];
  recentClusters: Array<{ id: ClusterId; openedAt: number }>;
  refreshIntervalSeconds: number;
  terminalFontSize: number;
  terminalFontFamily: string;
  defaultShell?: string;
  confirmBeforeDelete: boolean;
  showSystemNamespaces: boolean;
  sidebarWidth: number;
  dockHeight: number;
  tableRowHeight: number;
  collapseCatalogGroups: boolean;
  favoriteKinds: string[];
  hiddenClusters: ClusterId[];
  hotbarOrder: ClusterId[];
  sidebarGroupOrder: string[];
  tableColumnWidths: Record<string, number>;
  tableColumnOrder: Record<string, string[]>;
}

export interface AddKubeconfigResult {
  canceled: boolean;
  paths: string[];
}

export interface AppInfo {
  version: string;
  electron: string;
  chrome: string;
  node: string;
  platform: string;
  arch: string;
}

export interface PortForwardRequest {
  clusterId: ClusterId;
  namespace: string;
  pod: string;
  remotePort: number;
  localPort?: number;
}

export interface PortForwardInfo {
  id: string;
  clusterId: ClusterId;
  namespace: string;
  pod: string;
  remotePort: number;
  localPort: number;
  startedAt: number;
}

export interface NamespaceInfo {
  name: string;
  status: string;
  age?: string;
}

export interface ExecSessionConfig {
  clusterId: ClusterId;
  namespace: string;
  pod: string;
  container: string;
  command?: string;
}
