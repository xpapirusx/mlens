import {
  Activity,
  Box,
  Boxes,
  Braces,
  Camera,
  ChartColumn,
  Clock,
  Cloud,
  Copy,
  Cpu,
  Cylinder,
  Database,
  DatabaseBackup,
  DatabaseZap,
  DoorOpen,
  FileSliders,
  FileText,
  Fingerprint,
  FolderGit2,
  FolderOpen,
  Gauge,
  GitBranch,
  Globe,
  HardDrive,
  HeartPulse,
  KeyRound,
  Layers,
  Link,
  ListVideo,
  Lock,
  Network,
  Package,
  Play,
  Plug,
  Puzzle,
  Radio,
  Rocket,
  Route,
  Rows3,
  Scaling,
  Server,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Split,
  SquareTerminal,
  Timer,
  UserCog,
  Waypoints,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";

const BY_KIND: Record<string, LucideIcon> = {
  pod: Box,
  deployment: Rocket,
  daemonset: Rows3,
  statefulset: DatabaseZap,
  replicaset: Copy,
  replicationcontroller: Copy,
  job: Play,
  cronjob: Timer,
  jobset: ListVideo,
  rollout: Rocket,

  service: Plug,
  ingress: DoorOpen,
  ingressclass: DoorOpen,
  networkpolicy: ShieldCheck,
  clusternetworkpolicy: ShieldCheck,
  caliconetworkpolicy: ShieldCheck,
  calicoglobalnetworkpolicy: ShieldCheck,
  ciliumnetworkpolicy: ShieldCheck,
  ciliumclusterwidenetworkpolicy: ShieldCheck,
  endpoints: Radio,
  endpointslice: Radio,
  gateway: DoorOpen,
  gatewayclass: DoorOpen,
  httproute: Globe,
  grpcroute: Globe,
  tcproute: Globe,
  udproute: Globe,
  tlsroute: Globe,

  configmap: FileSliders,
  secret: KeyRound,
  sealedsecret: KeyRound,
  resourcequota: Gauge,
  limitrange: SlidersHorizontal,
  podtemplate: FileText,

  persistentvolumeclaim: HardDrive,
  pvc: HardDrive,
  persistentvolume: Cylinder,
  storageclass: Database,
  csidriver: Database,
  csinode: Database,
  volumeattachment: Link,

  node: Cpu,
  namespace: FolderOpen,
  serviceaccount: UserCog,
  event: Activity,
  componentstatus: HeartPulse,
  lease: Clock,

  horizontalpodautoscaler: Scaling,
  verticalpodautoscaler: Scaling,
  poddisruptionbudget: Shield,
  priorityclass: Layers,
  runtimeclass: Layers,

  role: ShieldCheck,
  clusterrole: ShieldCheck,
  rolebinding: ShieldCheck,
  clusterrolebinding: ShieldCheck,

  customresourcedefinition: Braces,
  apiservice: Waypoints,
  mutatingwebhookconfiguration: ShieldAlert,
  validatingwebhookconfiguration: ShieldAlert,
  validatingadmissionpolicy: ShieldAlert,
  validatingadmissionpolicybinding: ShieldAlert,

  application: GitBranch,
  applicationset: GitBranch,
  appproject: GitBranch,
  kustomization: Layers,
  helmrelease: Package,
  helmrepository: Package,
  gitrepository: FolderGit2,
  ocirepository: Package,
  bucket: Cloud,
  fluxinstance: Workflow,

  certificate: ShieldCheck,
  certificaterequest: ShieldCheck,
  issuer: ShieldCheck,
  clusterissuer: ShieldCheck,

  workflow: Workflow,
  cronworkflow: Workflow,
  workflowtemplate: Workflow,

  cluster: Cloud,
  machinedeployment: Rows3,
  machineset: Copy,
  machine: Server,
  kubeadmcontrolplane: Server,

  backup: DatabaseBackup,
  restore: DatabaseBackup,
  schedule: Timer,
  snapshot: Camera,

  middleware: Split,
  ingressroute: Route,
  traefikservice: Link,
  tlsoption: Lock,
  tlsstore: Lock,

  rayjob: Sparkles,
  rayservice: Sparkles,
  raycluster: Sparkles,
  knativeservice: Zap,
  serviceentry: Network,
  destinationrule: Split,
  virtualservice: Route,
  authorizationpolicy: ShieldCheck,
  peerauthentication: Lock,
  sidecar: Boxes,
  wasmplugin: Puzzle,

  terminal: SquareTerminal,
  metrics: ChartColumn,
  alert: ShieldAlert,
  audit: Fingerprint,
  settings: Settings,
};

const BY_GROUP_PREFIX: Array<[string, Record<string, LucideIcon>]> = [
  [
    "argoproj.io",
    {
      application: GitBranch,
      applicationset: GitBranch,
      appproject: GitBranch,
      workflow: Workflow,
      cronworkflow: Workflow,
      workflowtemplate: Workflow,
    },
  ],
  [
    "fluxcd.io",
    {
      kustomization: Layers,
      helmrelease: Package,
      gitrepository: FolderGit2,
      ocirepository: Package,
      bucket: Cloud,
    },
  ],
  [
    "cert-manager.io",
    { certificate: ShieldCheck, certificaterequest: ShieldCheck, issuer: ShieldCheck, clusterissuer: ShieldCheck },
  ],
  [
    "gateway.networking.k8s.io",
    { gateway: DoorOpen, httproute: Globe, grpcroute: Globe, tcproute: Globe, tlsroute: Globe },
  ],
  [
    "networking.istio.io",
    { virtualservice: Route, destinationrule: Split, gateway: DoorOpen, serviceentry: Network, sidecar: Boxes },
  ],
  ["security.istio.io", { authorizationpolicy: ShieldCheck, peerauthentication: Lock, requestauthentication: KeyRound }],
  ["velero.io", { backup: DatabaseBackup, restore: DatabaseBackup, schedule: Timer }],
  ["snapshot.storage.k8s.io", { volumesnapshot: Camera, volumesnapshotclass: Camera }],
];

/** Category accent colors used for sidebar icons and kind chips. */
export function kindColor(kind: string): string {
  const key = kind.toLowerCase();
  if (["pod"].includes(key)) return "text-k8s-pod";
  if (["deployment", "replicaset", "replicationcontroller"].includes(key)) return "text-k8s-deployment";
  if (["daemonset"].includes(key)) return "text-k8s-daemonset";
  if (["statefulset"].includes(key)) return "text-k8s-statefulset";
  if (["job"].includes(key)) return "text-k8s-job";
  if (["cronjob"].includes(key)) return "text-k8s-cronjob";
  if (["service"].includes(key)) return "text-k8s-service";
  if (["ingress", "gateway", "httproute", "grpcroute"].includes(key)) return "text-k8s-ingress";
  if (["configmap"].includes(key)) return "text-k8s-configmap";
  if (["secret", "sealedsecret"].includes(key)) return "text-k8s-secret";
  if (["horizontalpodautoscaler", "verticalpodautoscaler"].includes(key)) return "text-k8s-hpa";
  return "text-theme-text-secondary";
}

export function getKindIcon(kind: string, group?: string): LucideIcon {
  const key = kind.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (group) {
    const match = BY_GROUP_PREFIX.find(([prefix]) => group.includes(prefix));
    const groupIcon = match?.[1][key];
    if (groupIcon) return groupIcon;
  }
  return BY_KIND[key] ?? Puzzle;
}

const DISPLAY_NAMES: Record<string, string> = {
  pod: "Pods",
  deployment: "Deployments",
  daemonset: "DaemonSets",
  statefulset: "StatefulSets",
  replicaset: "ReplicaSets",
  replicationcontroller: "Replication Controllers",
  job: "Jobs",
  cronjob: "CronJobs",
  service: "Services",
  ingress: "Ingresses",
  ingressclass: "Ingress Classes",
  networkpolicy: "Network Policies",
  clusternetworkpolicy: "Cluster Network Policies",
  endpoints: "Endpoints",
  endpointslice: "EndpointSlices",
  configmap: "ConfigMaps",
  secret: "Secrets",
  resourcequota: "Resource Quotas",
  limitrange: "Limit Ranges",
  persistentvolume: "PersistentVolumes",
  persistentvolumeclaim: "PersistentVolumeClaims",
  storageclass: "Storage Classes",
  node: "Nodes",
  namespace: "Namespaces",
  serviceaccount: "Service Accounts",
  event: "Events",
  horizontalpodautoscaler: "Horizontal Pod Autoscalers",
  verticalpodautoscaler: "Vertical Pod Autoscalers",
  poddisruptionbudget: "Pod Disruption Budgets",
  role: "Roles",
  clusterrole: "Cluster Roles",
  rolebinding: "Role Bindings",
  clusterrolebinding: "Cluster Role Bindings",
  customresourcedefinition: "Custom Resource Definitions",
  apiservice: "API Services",
  lease: "Leases",
  priorityclass: "Priority Classes",
  runtimeclass: "Runtime Classes",
  mutatingwebhookconfiguration: "Mutating Webhooks",
  validatingwebhookconfiguration: "Validating Webhooks",
  gateway: "Gateways",
  httproute: "HTTP Routes",
  grpcroute: "gRPC Routes",
  certificate: "Certificates",
  certificaterequest: "Certificate Requests",
  clusterissuer: "Cluster Issuers",
  application: "Applications",
  applicationset: "ApplicationSets",
  workflow: "Workflows",
  podtemplate: "Pod Templates",
  csidriver: "CSI Drivers",
  csinode: "CSI Nodes",
  volumeattachment: "Volume Attachments",
  csistoragecapacity: "CSI Storage Capacities",
  controllerrevision: "Controller Revisions",
  certificatesigningrequest: "Certificate Signing Requests",
  flowschema: "Flow Schemas",
  prioritylevelconfiguration: "Priority Level Configurations",
  validatingadmissionpolicy: "Validating Admission Policies",
  validatingadmissionpolicybinding: "Validating Admission Policy Bindings",
  networkattachmentdefinition: "Network Attachment Definitions",
  challenge: "ACME Challenges",
  order: "ACME Orders",
  dnsrecord: "DNS Records",
  dnsdestination: "DNS Destinations",
  dnssource: "DNS Sources",
  imagejob: "Image Jobs",
  servicemonitor: "Service Monitors",
  podmonitor: "Pod Monitors",
  prometheusrule: "Prometheus Rules",
  volumesnapshot: "Volume Snapshots",
  volumesnapshotclass: "Volume Snapshot Classes",
};

export function kindLabel(kind: string, plural?: string): string {
  const byKind = DISPLAY_NAMES[kind.toLowerCase()];
  if (byKind) return byKind;
  if (plural && plural.length > 1) {
    return plural.charAt(0).toUpperCase() + plural.slice(1).replace(/([a-z])([A-Z])/g, "$1 $2");
  }
  return kind;
}
