/**
 * Shared domain types between the Electron main process and the renderer.
 * No Electron or Node imports are allowed in this file.
 */

export type ClusterId = string;
export type ThemeMode = "light" | "dark" | "system";
export type ColorTheme = "radar" | "dracula" | "freelens" | "proton";

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
  /** Attach streams the existing process instead of starting a shell. */
  mode?: "exec" | "attach";
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

export interface PatchResourceRequest extends ResourceKey {
  patch: Record<string, unknown>;
}

export interface DeleteResourceRequest extends ResourceKey {
  propagationPolicy?: "Foreground" | "Background" | "Orphan";
  /** Force deletion: grace period 0 (kubectl delete --force --grace-period=0). */
  force?: boolean;
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

export interface EvictPodRequest {
  clusterId: ClusterId;
  namespace: string;
  name: string;
  gracePeriodSeconds?: number;
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
  /** Ten hotbar positions; null is an empty slot. Mirrors the active page. */
  hotbarSlots: Array<ClusterId | null>;
  /** Freelens-style hotbar pages: each page holds up to ten slots. */
  hotbarPages: Array<Array<ClusterId | null>>;
  /** Index of the hotbar page currently shown on the rail. */
  hotbarPageIndex: number;
  /**
   * Saved annotations offered by the bulk "Annotate" action in the resource
   * browser. One `key=value` entry each; the list is editable in the UI.
   */
  annotationPresets: Record<string, string>;
  /** Same idea for the bulk "Labels" action. */
  labelPresets: Record<string, string>;
  sidebarGroupOrder: string[];
  tableColumnWidths: Record<string, number>;
  tableColumnOrder: Record<string, string[]>;
  /** Last explicit sort per `<apiVersion>|<kind>`; absent = newest first. */
  tableSorts: Record<string, TableSort>;
}

export interface TableSort {
  key: string;
  direction: "asc" | "desc";
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

// ── RBAC reverse lookup (effective permissions for a subject) ────────────────
// Mirrors the wire shape of Radar's /api/rbac/subject endpoint.

export interface RbacSubjectRequest {
  clusterId: ClusterId;
  /** Only ServiceAccount subjects are supported today. */
  kind: "ServiceAccount";
  namespace: string;
  name: string;
}

export interface RbacPolicyRule {
  verbs?: string[];
  apiGroups?: string[];
  resources?: string[];
  resourceNames?: string[];
  nonResourceURLs?: string[];
}

export interface RbacRoleRef {
  kind: string;
  namespace?: string;
  name: string;
}

export interface RbacBindingRef {
  kind: string;
  namespace?: string;
  name: string;
  roleRef: RbacRoleRef;
}

export interface RbacBindingRules {
  binding: RbacBindingRef;
  role: RbacRoleRef;
  rules: RbacPolicyRule[];
  /** Set when a RoleBinding points at a ClusterRole: rules apply only here. */
  scopeNamespace?: string;
  /** Implicit group that brought the binding in; absent for direct grants. */
  inheritedFromGroup?: string;
}

export interface RbacInheritedGroup {
  groupName: string;
  bindings: RbacBindingRules[];
}

export interface RbacSubjectResponse {
  subject: { kind: string; namespace?: string; name: string };
  direct: RbacBindingRules[];
  inheritedFromGroups: RbacInheritedGroup[];
  /** Deduplicated rules across every binding, capped at 500. */
  flat: RbacPolicyRule[];
  truncated: boolean;
}

export interface RbacRoleRequest {
  clusterId: ClusterId;
  kind: "Role" | "ClusterRole";
  /** Required for Role; ignored for ClusterRole. */
  namespace?: string;
  name: string;
}

export interface RbacSubjectEntry {
  kind: string;
  namespace?: string;
  name: string;
}

export interface RbacRoleResponse {
  role: { kind: string; namespace?: string; name: string };
  /** Empty when the referenced role does not exist (orphan binding). */
  rules: RbacPolicyRule[];
  bindings: Array<{ binding: RbacBindingRef; subjects: RbacSubjectEntry[] }>;
  /** True when the role itself could not be found in the cluster. */
  roleMissing?: boolean;
}

// ── Policy reports (what the cluster's policy engine says about one resource) ─

export interface PolicyResourceRequest {
  clusterId: ClusterId;
  /** Singular kind of the subject, e.g. "Deployment" or "Pod". */
  kind: string;
  namespace?: string;
  name: string;
}

export interface PolicyResourceFinding {
  policy: string;
  rule?: string;
  /** pass | fail | warn | error | skip (engines may add their own). */
  result: string;
  severity?: string;
  category?: string;
  message?: string;
  engine?: string;
}

export interface PolicyResourceCounts {
  pass: number;
  fail: number;
  warn: number;
  error: number;
  skip: number;
}

export interface PolicyResourceResponse {
  /** False whenever the answer is "we could not check" — never read an empty
   *  findings array as clean without consulting this first. */
  evaluated: boolean;
  status: string;
  reasonCode?: string;
  /** Report families this identity may not read; counts exclude them. */
  deniedGroups?: string[];
  liveUpdates: boolean;
  counts: PolicyResourceCounts;
  findings: PolicyResourceFinding[];
}

// ── Helm (release secrets parsed without a Helm binary) ──────────────────────
// Helm v3 stores every release as a Secret labelled `owner=helm` whose `release`
// key is base64(gzip(release JSON)). Reading that is enough for a list and a
// detail view; no `helm` binary and no network to a chart repo is involved.

export interface HelmReleasesRequest {
  clusterId: ClusterId;
  /** Optional namespace scope; undefined lists every namespace. */
  namespace?: string;
}

export interface HelmReleaseSummary {
  name: string;
  namespace: string;
  /** Revision number; higher is newer. */
  revision: number;
  /** deployed | failed | pending-* | superseded | uninstalled | unknown */
  status: string;
  /** `chart-name-1.2.3` */
  chart: string;
  chartName: string;
  chartVersion: string;
  appVersion?: string;
  deployedAt?: string;
  description?: string;
  /** The Secret this row came from (older revisions live in `name.vN`). */
  secretName: string;
}

export interface HelmReleaseRequest {
  clusterId: ClusterId;
  namespace: string;
  /** Release name (not the secret name). */
  name: string;
  /** View a specific revision instead of the current one. */
  revision?: number;
}

export interface HelmReleaseDetail extends HelmReleaseSummary {
  /** Deployed values as YAML. */
  values: string;
  /** Rendered manifests as YAML text. */
  manifest: string;
  /** True when values/manifest were cut to keep the payload bounded. */
  truncated?: boolean;
  /** Release notes stored with this revision (`info.notes`). */
  notes?: string;
  /** Lifecycle hooks recorded in the release object (read-only). */
  hooks?: HelmHookInfo[];
  /** Every revision of this release found in the cluster (newest first). */
  revisions: HelmRevisionInfo[];
  /** Objects the manifest creates — clickable in the drawer. */
  resources: HelmManifestRef[];
  /** The revision currently displayed (differs from `revision` when viewing history). */
  viewedRevision: number;
}

export interface HelmRevisionInfo {
  revision: number;
  status: string;
  deployedAt?: string;
  description?: string;
  chart: string;
}

/** A Helm hook stored in the release record (no execution, read-only). */
export interface HelmHookInfo {
  name: string;
  kind: string;
  events?: string[];
  /** Helm stores `last_run` as an object, not a timestamp string. */
  lastRun?: {
    startedAt?: string;
    completedAt?: string;
    phase?: string;
  };
  weight?: number;
  deletePolicies?: string[];
}

/** One object referenced by a release manifest. */
export interface HelmManifestRef {
  apiVersion: string;
  kind: string;
  namespace?: string;
  name: string;
}

export interface HelmRollbackRequest {
  clusterId: ClusterId;
  namespace: string;
  name: string;
  /** Revision to roll back to; a new revision is created on top of it. */
  revision: number;
}
