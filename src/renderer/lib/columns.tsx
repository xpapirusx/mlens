import { Fragment, type ReactNode } from "react";
import { Copy, TriangleExclamationPoint } from "lucide-react";
import type { ApiResourceInfo } from "@shared/types";
import { formatAge, formatCpu, formatDurationSeconds, formatRelativeTime, formatTimestamp, parseCpu, parseMemory, formatBytes } from "./format";
import { resourceStatus, toneClass } from "./status";
import { cn } from "./cn";
import { ResourceBar } from "../design-system/components/ResourceBar";
import { Tooltip } from "../design-system/components/Tooltip";
import { daysUntil, parseCertificate } from "./certificate";
import { readJsonPath } from "./jsonpath";
import type { NodeUsage, PodUsage } from "../features/resource-browser/useResourceMetrics";
import type { WarningEntry } from "../features/resource-browser/useWarningEvents";

export type AnyObject = any;

export interface ColumnDef {
  key: string;
  label: string;
  width?: number;
  flex?: boolean;
  align?: "left" | "right";
  sortable?: boolean;
  defaultHidden?: boolean;
  tooltip?: string;
  value?: (object: AnyObject, context?: CellContext) => string | number | undefined;
  cell: (object: AnyObject, context: CellContext) => ReactNode;
  filterValue?: (object: AnyObject, context?: CellContext) => string | undefined;
}

export interface RefTarget {
  kind: string;
  name: string;
  namespace?: string;
  apiVersion?: string;
}

export interface CellContext {
  showNamespace: boolean;
  podMetrics?: Map<string, PodUsage>;
  nodeMetrics?: Map<string, NodeUsage>;
  onSelectNamespace?: (namespace: string) => void;
  onOpenNode?: (name: string) => void;
  /** Opens any discovered resource from a table cell (owner, PV, PVC pod, …). */
  onOpenRef?: (target: RefTarget) => void;
  /** `${namespace}/${claimName}` → pod names that mount the claim. */
  claimPods?: Map<string, string[]>;
  /** `${namespace}/${service}` → ready address count from the Endpoints object. */
  serviceEndpoints?: Map<string, number>;
  /** `${namespace}/${name}` → latest Warning event (Freelens' warnings column). */
  warnings?: Map<string, WarningEntry>;
}

const statusValue = (object: AnyObject, kind: string): string => resourceStatus(object, kind).text;

function StatusCell({ object, kind }: { object: AnyObject; kind: string }) {
  const status = resourceStatus(object, kind);
  return (
    <span className={cn("badge", toneClass(status.tone))} title={status.detail}>
      {status.text}
    </span>
  );
}

function AgeCell({ object }: { object: AnyObject }) {
  const timestamp = object.metadata?.creationTimestamp;
  return (
    <span className="mono-nums text-theme-text-tertiary" title={formatTimestamp(timestamp)}>
      {formatAge(timestamp)}
    </span>
  );
}

function NameCell({ object }: { object: AnyObject }) {
  const terminating = Boolean(object.metadata?.deletionTimestamp);
  const name = object.metadata?.name ?? "";
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span
        className={cn(
          "truncate text-sm font-medium",
          terminating ? "text-theme-text-tertiary line-through" : "text-theme-text-primary",
        )}
        title={name}
      >
        {name}
      </span>
      <button
        type="button"
        title="Copy name"
        className="shrink-0 rounded p-0.5 text-theme-text-tertiary opacity-0 transition-opacity hover:bg-theme-hover hover:text-theme-text-primary group-hover/row:opacity-100"
        onClick={(event) => {
          event.stopPropagation();
          void navigator.clipboard.writeText(name);
        }}
      >
        <Copy className="h-3 w-3" />
      </button>
    </div>
  );
}

function Mono({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span className="mono-nums text-theme-text-secondary" title={title}>
      {children}
    </span>
  );
}

function TextCell({ children, title }: { children: ReactNode; title?: string }) {
  if (children === undefined || children === null || children === "" || children === "–") {
    return <span className="text-sm text-theme-text-tertiary">–</span>;
  }
  return (
    <span className="block truncate text-sm text-theme-text-secondary" title={title}>
      {children}
    </span>
  );
}

function podContainers(object: AnyObject): Array<Record<string, any>> {
  return [
    ...(object.status?.initContainerStatuses ?? []),
    ...(object.status?.containerStatuses ?? []),
  ];
}

type ContainerState = "ready" | "running" | "waiting" | "completed" | "terminated" | "unknown";

interface ContainerSquare {
  name: string;
  status: ContainerState;
  restarts: number;
  reason?: string;
  message?: string;
  exitCode?: number;
  startedAt?: string;
  finishedAt?: string;
  isInit?: boolean;
  /** Last termination — the signal that explains a CrashLoopBackOff. */
  lastTermination?: { reason?: string; exitCode?: number; startedAt?: string; finishedAt?: string };
}

function squareState(status: Record<string, any>, ready: boolean): ContainerState {
  const stateKey = status && typeof status === "object" ? Object.keys(status)[0] : undefined;
  if (!stateKey) return "unknown";
  if (stateKey === "running") return ready ? "ready" : "running";
  if (stateKey === "waiting") return "waiting";
  if (stateKey === "terminated") return status.terminated?.exitCode === 0 ? "completed" : "terminated";
  return "unknown";
}

/** Radar's `getContainerSquareStates`: one square per container, init first. */
function containerSquares(object: AnyObject): ContainerSquare[] {
  const initNames = new Set(
    ((object.spec?.initContainers ?? []) as Array<{ name: string }>).map((container) => container.name),
  );
  const toSquare = (status: Record<string, any>, isInit: boolean): ContainerSquare => {
    const stateKey = status?.state && typeof status.state === "object" ? Object.keys(status.state)[0] : undefined;
    const detail = stateKey ? status.state?.[stateKey] : undefined;
    const last = status.lastState?.terminated;
    return {
      name: String(status.name ?? ""),
      status: stateKey === "running" && status.ready ? "ready" : squareState(status.state ?? {}, Boolean(status.ready)),
      restarts: Number(status.restartCount ?? 0),
      reason: detail?.reason,
      message: detail?.message,
      exitCode: detail?.exitCode,
      startedAt: detail?.startedAt,
      finishedAt: detail?.finishedAt,
      isInit,
      lastTermination: last
        ? { reason: last.reason, exitCode: last.exitCode, startedAt: last.startedAt, finishedAt: last.finishedAt }
        : undefined,
    };
  };
  const init = ((object.status?.initContainerStatuses ?? []) as Array<Record<string, any>>).map((status) =>
    toSquare(status, initNames.has(String(status.name))),
  );
  const main = ((object.status?.containerStatuses ?? []) as Array<Record<string, any>>).map((status) =>
    toSquare(status, false),
  );
  return [...init, ...main];
}

function ago(timestamp?: string): string | null {
  if (!timestamp) return null;
  const ms = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  if (ms < 60_000) return "just now";
  return `${formatAge(timestamp)} ago`;
}

function ranFor(start?: string, end?: string): string | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return ms > 0 ? formatDurationSeconds(Math.round(ms / 1000)) : null;
}

function ContainerTooltip({ square }: { square: ContainerSquare }) {
  const stateLabel =
    square.status === "ready"
      ? "Running"
      : square.status === "completed"
        ? "Completed"
        : square.status === "running"
          ? "Running (not ready)"
          : square.status === "waiting"
            ? "Waiting"
            : square.status === "terminated"
              ? "Terminated"
              : "Unknown";
  const uptime =
    square.status === "ready" || square.status === "running" ? ago(square.startedAt) : null;
  const duration =
    square.status === "completed" || square.status === "terminated"
      ? ranFor(square.startedAt, square.finishedAt)
      : null;
  const last = square.lastTermination;
  const restartAge = last?.finishedAt ? Date.now() - new Date(last.finishedAt).getTime() : null;
  const restartColor =
    restartAge !== null && restartAge < 600_000
      ? "text-red-600 dark:text-red-400"
      : restartAge !== null && restartAge < 3_600_000
        ? "text-amber-600 dark:text-amber-400"
        : "text-orange-600 dark:text-orange-400";

  return (
    <div className="max-w-[280px] space-y-1">
      <div className="flex items-center gap-1.5">
        <span className="font-medium text-theme-text-primary">
          {square.isInit ? <span className="font-normal text-theme-text-tertiary">init · </span> : null}
          {square.name}
        </span>
        <span className="text-theme-text-tertiary">·</span>
        <span className="text-theme-text-secondary">{stateLabel}</span>
      </div>
      {square.reason && square.reason !== stateLabel ? (
        <div
          className={
            square.status === "waiting" || square.status === "terminated"
              ? "font-medium text-red-600 dark:text-red-400"
              : "text-theme-text-secondary"
          }
        >
          {square.reason}
        </div>
      ) : null}
      {square.message ? (
        <div className="text-theme-text-secondary">
          {square.message.length > 120 ? `${square.message.slice(0, 120)}…` : square.message}
        </div>
      ) : null}
      {(square.exitCode !== undefined && square.status !== "ready" && square.status !== "running") ||
      uptime ||
      duration ? (
        <div className="flex items-center gap-1.5 text-theme-text-tertiary">
          {square.exitCode !== undefined && square.status !== "ready" && square.status !== "running" ? (
            <span className={square.exitCode !== 0 ? "text-red-600 dark:text-red-400" : undefined}>
              exit {square.exitCode}
            </span>
          ) : null}
          {uptime ? <span>up {uptime.replace(" ago", "")}</span> : null}
          {duration ? <span>ran {duration}</span> : null}
        </div>
      ) : null}
      {square.restarts > 0 ? (
        <div className={`space-y-0.5 border-t border-theme-border/50 pt-1 ${restartColor}`}>
          <div className="flex items-center gap-1.5">
            <span>
              {square.restarts} restart{square.restarts === 1 ? "" : "s"}
            </span>
            {last?.finishedAt ? <span className="text-theme-text-tertiary">· last {ago(last.finishedAt)}</span> : null}
          </div>
          {last?.reason ? (
            <div className="text-theme-text-tertiary">
              {last.reason}
              {last.exitCode !== undefined && last.exitCode !== 0 ? ` (exit ${last.exitCode})` : ""}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Radar's container squares: one 10px tile per container, colour by state, an
 * orange ring while the container is restarting, and a separator between the
 * init block and the main containers.
 */
function ContainersCell({ object }: { object: AnyObject }) {
  const squares = containerSquares(object);
  if (squares.length === 0) return <span className="text-sm text-theme-text-tertiary">–</span>;
  const hasInit = squares.some((square) => square.isInit);
  return (
    <div className="flex w-full items-center justify-center gap-1">
      {squares.map((square, index) => {
        const showSeparator = hasInit && index > 0 && Boolean(square.isInit) !== Boolean(squares[index - 1].isInit);
        const background =
          square.status === "ready"
            ? "bg-emerald-500"
            : square.status === "completed"
              ? "border border-theme-text-tertiary/60 bg-theme-text-tertiary/30"
              : square.status === "running"
                ? "bg-amber-500"
                : square.status === "waiting" || square.status === "terminated"
                  ? "bg-red-500"
                  : "border border-dashed border-theme-text-tertiary";
        return (
          <Fragment key={`${square.name}-${index}`}>
            {showSeparator ? (
              <span className="mx-0.5 h-3 w-px bg-theme-text-tertiary/40" aria-hidden />
            ) : null}
            <Tooltip content={<ContainerTooltip square={square} />} wrapperClassName="shrink-0">
              <span className={cn("h-2.5 w-2.5 rounded-sm", background, square.restarts > 0 && "ring-2 ring-orange-400")} />
            </Tooltip>
          </Fragment>
        );
      })}
    </div>
  );
}

function sumContainerResources(object: AnyObject, kind: "cpu" | "memory", field: "requests" | "limits"): number {
  const containers = (object.spec?.containers ?? []) as Array<Record<string, any>>;
  return containers.reduce((sum, container) => {
    const value = container.resources?.[field]?.[kind];
    const parsed = kind === "cpu" ? parseCpu(value) : parseMemory(value);
    return sum + (parsed ?? 0);
  }, 0);
}

function PodUsageCell({
  object,
  kind,
  metrics,
}: {
  object: AnyObject;
  kind: "cpu" | "memory";
  metrics?: Map<string, PodUsage>;
}) {
  const key = `${object.metadata?.namespace}/${object.metadata?.name}`;
  const sample = metrics?.get(key);
  if (!sample) return <span className="text-sm text-theme-text-tertiary">–</span>;

  const formats = kind === "cpu" ? formatCpu : formatBytes;
  const usage = sample.containers.reduce((sum, container) => sum + container[kind], 0);
  if (usage <= 0) return <span className="text-sm text-theme-text-tertiary">–</span>;

  const requests = sumContainerResources(object, kind, "requests");
  const limits = sumContainerResources(object, kind, "limits");
  const containers = (object.spec?.containers ?? []) as Array<Record<string, any>>;
  const allLimited = containers.length > 0 && containers.every((container) => {
    const value = container.resources?.limits?.[kind];
    const parsed = kind === "cpu" ? parseCpu(value) : parseMemory(value);
    return (parsed ?? 0) > 0;
  });

  const mode = limits > 0 ? "limit" : requests > 0 ? "request" : "none";
  if (mode === "none") {
    return <span className="font-mono text-[11px] text-theme-text-secondary">{formats(usage)}</span>;
  }

  const denom = mode === "limit" ? limits : requests;
  const percent = denom > 0 ? (usage / denom) * 100 : 0;
  const marker = mode === "limit" && requests > 0 && requests < limits ? (requests / limits) * 100 : undefined;

  const tooltip = (
    <div className="space-y-1">
      {sample.containers.map((container) => {
        const spec = containers.find((entry) => entry.name === container.name);
        const req = kind === "cpu" ? parseCpu(spec?.resources?.requests?.cpu) : parseMemory(spec?.resources?.requests?.memory);
        const lim = kind === "cpu" ? parseCpu(spec?.resources?.limits?.cpu) : parseMemory(spec?.resources?.limits?.memory);
        return (
          <div key={container.name} className="flex items-center gap-2 font-mono text-[10px]">
            <span className="min-w-0 flex-1 truncate text-theme-text-primary">{container.name}</span>
            <span>{formats(container[kind])}</span>
            <span className="text-theme-text-disabled">
              req {req ? formats(req) : "–"} · lim {lim ? formats(lim) : "–"}
            </span>
          </div>
        );
      })}
      <div className="text-[10px] text-theme-text-tertiary">
        {mode === "limit" ? "Usage against the summed container limit" : "Usage against the summed request (no limit set)"}
        {!allLimited && mode === "limit" ? " · some containers unbounded" : ""}
      </div>
    </div>
  );

  return (
    <ResourceBar
      used={formats(usage)}
      total={formats(denom)}
      percent={percent}
      scheme={mode === "limit" ? "utilization" : "quiet"}
      markerPercent={marker}
      tooltip={tooltip}
    />
  );
}

const namespaceColumn: ColumnDef = {
  key: "namespace",
  label: "Namespace",
  width: 168,
  sortable: true,
  value: (object) => object.metadata?.namespace ?? "",
  cell: (object, context) =>
    object.metadata?.namespace ? (
      <button
        type="button"
        className="truncate text-left text-accent-text hover:underline"
        title={`Scope the table to ${object.metadata.namespace}`}
        onClick={(event) => {
          event.stopPropagation();
          context.onSelectNamespace?.(object.metadata.namespace!);
        }}
      >
        {object.metadata.namespace}
      </button>
    ) : (
      <TextCell>–</TextCell>
    ),
  filterValue: (object) => object.metadata?.namespace,
};

const ageColumn: ColumnDef = {
  key: "age",
  label: "Age",
  width: 88,
  align: "right",
  sortable: true,
  value: (object) => object.metadata?.creationTimestamp ?? "",
  cell: (object) => <AgeCell object={object} />,
};

const nameColumn: ColumnDef = {
  key: "name",
  label: "Name",
  flex: true,
  sortable: true,
  value: (object) => object.metadata?.name ?? "",
  cell: (object) => <NameCell object={object} />,
};

function statusColumn(kind: string, width = 168): ColumnDef {
  return {
    key: "status",
    label: "Status",
    width,
    sortable: true,
    value: (object) => statusValue(object, kind),
    cell: (object) => <StatusCell object={object} kind={kind} />,
    filterValue: (object) => statusValue(object, kind),
  };
}

const utf8 = new TextEncoder();

/** Radar's `getConfigMapSize`: UTF-8 data plus decoded binaryData (≈ 0.75×). */
function configMapBytes(object: AnyObject): number {
  const data = (object.data ?? {}) as Record<string, string>;
  const binary = (object.binaryData ?? {}) as Record<string, string>;
  let total = 0;
  for (const value of Object.values(data)) total += utf8.encode(value).length;
  for (const value of Object.values(binary)) total += Math.floor(value.length * 0.75);
  return total;
}

/** TLS certificate inside a Secret, when there is a parseable one. */
function secretCertificate(object: AnyObject): { days: number | null; expires?: Date; failed?: boolean } | null {
  const crt = (object.data as Record<string, string> | undefined)?.["tls.crt"];
  if (!crt) return null;
  const info = parseCertificate(crt);
  if (!info?.notAfter) return { days: null, failed: true };
  return { days: daysUntil(info.notAfter), expires: info.notAfter };
}

const SECRET_TYPE_TONES: Record<string, string> = {
  "kubernetes.io/tls": "status-neutral",
  "kubernetes.io/dockercfg": "status-purple",
  "kubernetes.io/dockerconfigjson": "status-purple",
  "kubernetes.io/basic-auth": "status-orange",
  "kubernetes.io/ssh-auth": "status-violet",
  "kubernetes.io/service-account-token": "status-healthy",
  "bootstrap.kubernetes.io/token": "status-healthy",
};

function secretTypeLabel(type: string | undefined): string {
  const value = type ?? "Opaque";
  if (value === "Opaque") return "Opaque";
  if (value.includes("dockercfg") || value.includes("dockerconfigjson")) return "Docker";
  if (value === "kubernetes.io/basic-auth") return "Basic Auth";
  if (value === "kubernetes.io/ssh-auth") return "SSH";
  if (value === "kubernetes.io/service-account-token") return "SA Token";
  if (value === "kubernetes.io/tls") return "TLS";
  if (value === "bootstrap.kubernetes.io/token") return "Bootstrap";
  const tail = value.split("/").pop();
  return tail ?? value;
}

function SecretTypeCell({ object }: { object: AnyObject }) {
  const type = (object.type as string | undefined) ?? "Opaque";
  return (
    <span className={cn("badge-sm", SECRET_TYPE_TONES[type] ?? "status-unknown")} title={type}>
      {secretTypeLabel(type)}
    </span>
  );
}

function SecretExpiresCell({ object }: { object: AnyObject }) {
  const cert = secretCertificate(object);
  if (!cert) return <span className="text-sm text-theme-text-tertiary">–</span>;
  if (cert.failed || cert.days === null) {
    return (
      <span
        className="text-sm text-amber-600 dark:text-amber-400"
        title="The certificate in this Secret could not be parsed"
      >
        !
      </span>
    );
  }
  const days = cert.days;
  const tone =
    days < 30
      ? "text-red-600 dark:text-red-400"
      : days < 90
        ? "text-amber-600 dark:text-amber-400"
        : "text-emerald-600 dark:text-emerald-400";
  return (
    <span
      className={cn("mono-nums text-sm", tone)}
      title={`Certificate expires ${formatTimestamp(cert.expires?.toISOString())}`}
    >
      {days < 0 ? `Expired ${Math.abs(days)}d ago` : `${days}d`}
    </span>
  );
}

function ServiceTypeCell({ object }: { object: AnyObject }) {
  const type = (object.spec?.type as string | undefined) ?? "ClusterIP";
  const tone =
    type === "LoadBalancer" || type === "NodePort"
      ? "status-violet"
      : type === "ExternalName"
        ? "status-alert"
        : "status-neutral";
  return <span className={cn("badge-sm", tone)}>{type}</span>;
}

/** Helm release status → badge tone (helm.sh/release vocabulary). */
export const HELM_STATUS_TONES: Record<string, string> = {
  deployed: "status-healthy",
  failed: "status-unhealthy",
  pending: "status-degraded",
  "pending-install": "status-degraded",
  "pending-upgrade": "status-degraded",
  "pending-rollback": "status-degraded",
  uninstalling: "status-degraded",
  superseded: "status-unknown",
  uninstalled: "status-unknown",
  unknown: "status-unknown",
};

function HelmStatusCell({ object }: { object: AnyObject }) {
  const phase = String(object.status?.phase ?? "unknown");
  return <span className={cn("badge-sm", HELM_STATUS_TONES[phase] ?? "status-unknown")}>{phase}</span>;
}

function externalAddresses(object: AnyObject): string[] {
  return ((object.status?.loadBalancer?.ingress ?? []) as Array<{ ip?: string; hostname?: string }>)
    .map((entry) => entry.ip ?? entry.hostname ?? "")
    .filter(Boolean);
}

interface EndpointsValue {
  label: string;
  count?: number;
}

/** Radar's endpoints cell value: External / None / Active / No endpoints. */
function serviceEndpointsValue(object: AnyObject, context?: CellContext): EndpointsValue {
  if (object.spec?.type === "ExternalName") return { label: "External" };
  const selector = (object.spec?.selector ?? {}) as Record<string, string>;
  if (Object.keys(selector).length === 0) return { label: "None" };
  const count = context?.serviceEndpoints?.get(`${object.metadata?.namespace}/${object.metadata?.name}`);
  // Undefined means the Endpoints list was not fetched, not "no addresses".
  if (count === undefined) return { label: "" };
  return count > 0 ? { label: "Active", count } : { label: "No endpoints", count: 0 };
}

function ServiceEndpointsCell({ object, context }: { object: AnyObject; context?: CellContext }) {
  const value = serviceEndpointsValue(object, context);
  if (!value.label) return <span className="text-sm text-theme-text-tertiary">–</span>;
  if (value.label === "External") return <span className="badge-sm status-violet">External</span>;
  if (value.label === "None") return <span className="badge-sm status-unknown">None</span>;
  if (value.label === "No endpoints") {
    return (
      <span className="badge-sm status-degraded" title="The Endpoints object has no addresses">
        No endpoints
      </span>
    );
  }
  return (
    <span
      className="badge-sm status-healthy"
      title={`${value.count ?? 0} address${value.count === 1 ? "" : "es"}`}
    >
      Active
    </span>
  );
}

/** `sa:`/`grp:` preview of a binding's subjects, Radar's RoleBinding cell. */
function SubjectsCell({ object }: { object: AnyObject }) {
  const subjects = (object.subjects ?? []) as Array<{ kind?: string; name?: string; namespace?: string }>;
  if (subjects.length === 0) return <span className="text-sm text-theme-text-secondary">0</span>;
  const prefix = (kind: string | undefined) =>
    kind === "ServiceAccount" ? "sa:" : kind === "Group" ? "grp:" : kind === "User" ? "usr:" : "";
  const title = subjects
    .map((subject) => `${subject.kind}:${subject.namespace ? `${subject.namespace}/` : ""}${subject.name}`)
    .join("\n");
  return (
    <span className="block truncate text-sm text-theme-text-secondary" title={title}>
      {subjects.slice(0, 2).map((subject) => `${prefix(subject.kind)}${subject.name}`).join(", ")}
      {subjects.length > 2 ? <span className="text-theme-text-tertiary"> +{subjects.length - 2}</span> : null}
    </span>
  );
}

function RoleRefCell({ object }: { object: AnyObject }) {
  const role = object.roleRef as { kind?: string; name?: string } | undefined;
  if (!role?.name) return <TextCell>–</TextCell>;
  const cluster = role.kind === "ClusterRole";
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className={cn("badge-sm shrink-0", cluster ? "status-violet" : "status-neutral")}>
        {cluster ? "CR" : "R"}
      </span>
      <span className="truncate text-sm text-theme-text-secondary" title={`${role.kind}/${role.name}`}>
        {role.name}
      </span>
    </span>
  );
}

/** Kinds whose table carries the Warnings column (Freelens' pods-warning column). */
export const WARNING_KINDS = new Set([
  "Pod",
  "Deployment",
  "StatefulSet",
  "DaemonSet",
  "ReplicaSet",
  "Job",
  "CronJob",
  "Node",
]);

const warningEventKey = (object: AnyObject): string =>
  `${object.metadata?.namespace ?? ""}/${object.metadata?.name}`;

function WarningsCell({ object, context }: { object: AnyObject; context?: CellContext }) {
  const entry = context?.warnings?.get(warningEventKey(object));
  if (!entry) return null;
  return (
    <Tooltip
      wrapperClassName="inline-flex"
      content={
        <div className="max-w-[300px] space-y-1">
          <div className="font-medium text-amber-600 dark:text-amber-400">{entry.reason ?? "Warning"}</div>
          <div className="text-theme-text-secondary">{entry.message}</div>
          {entry.count > 1 ? (
            <div className="text-theme-text-tertiary">{entry.count} warning events</div>
          ) : null}
        </div>
      }
    >
      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
        <TriangleExclamationPoint className="h-3.5 w-3.5" />
        <span className="font-mono text-[11px]">{entry.count}</span>
      </span>
    </Tooltip>
  );
}

function warningsColumn(): ColumnDef {
  return {
    key: "warnings",
    label: "Warnings",
    width: 104,
    tooltip: "Warning events for this resource — hover for the latest message",
    sortable: true,
    value: (object, context) => context?.warnings?.get(warningEventKey(object))?.count ?? 0,
    cell: (object, context) => <WarningsCell object={object} context={context} />,
    filterValue: (object, context) => context?.warnings?.get(warningEventKey(object))?.reason,
  };
}

export function getColumnsForKind(resource: ApiResourceInfo, showNamespace: boolean): ColumnDef[] {
  const kind = resource.kind;
  const lower = kind.toLowerCase();
  const columns: ColumnDef[] = [nameColumn];
  const base: ColumnDef[] = [];

  switch (lower) {
    case "pod": {
      base.push(
        {
          key: "containers",
          label: "Containers",
          width: 102,
          cell: (object) => <ContainersCell object={object} />,
          value: (object) => podContainers(object).filter((container) => container.ready).length,
        },
        statusColumn("Pod"),
        {
          key: "ports",
          label: "Ports",
          width: 132,
          defaultHidden: true,
          value: (object) =>
            ((object.spec?.containers ?? []) as Array<Record<string, any>>)
              .flatMap((container) => container.ports ?? [])
              .map((port: any) => port.containerPort)
              .join(","),
          cell: (object) => {
            const ports = ((object.spec?.containers ?? []) as Array<Record<string, any>>)
              .flatMap((container) =>
                ((container.ports ?? []) as Array<Record<string, any>>).map(
                  (port) => `${port.containerPort}/${port.protocol ?? "TCP"}`,
                ),
              );
            return <TextCell>{ports.join(", ") || "–"}</TextCell>;
          },
        },
        {
          key: "cpu",
          label: "CPU",
          width: 196,
          tooltip: "CPU usage / limit (marker = request)",
          sortable: true,
          value: (object) => sumContainerResources(object, "cpu", "requests"),
          cell: (object, context) => (
            <PodUsageCell object={object} kind="cpu" metrics={context.podMetrics} />
          ),
        },
        {
          key: "memory",
          label: "Memory",
          width: 196,
          tooltip: "Memory usage / limit (marker = request)",
          sortable: true,
          value: (object) => sumContainerResources(object, "memory", "requests"),
          cell: (object, context) => (
            <PodUsageCell object={object} kind="memory" metrics={context.podMetrics} />
          ),
        },
        {
          key: "restarts",
          label: "Restarts",
          width: 112,
          align: "right",
          sortable: true,
          value: (object) =>
            podContainers(object).reduce((sum, container) => sum + Number(container.restartCount ?? 0), 0),
          cell: (object) => {
            const total = podContainers(object).reduce(
              (sum, container) => sum + Number(container.restartCount ?? 0),
              0,
            );
            return (
              <span
                className={cn(
                  "mono-nums",
                  total > 5 ? "text-red-600 dark:text-red-400" : total > 0 ? "text-amber-600 dark:text-amber-400" : "text-theme-text-tertiary",
                )}
              >
                {total}
              </span>
            );
          },
          filterValue: () => undefined,
        },
        {
          key: "owner",
          label: "Controlled by",
          width: 190,
          defaultHidden: true,
          value: (object) =>
            object.metadata?.ownerReferences?.[0]
              ? `${object.metadata.ownerReferences[0].kind}/${object.metadata.ownerReferences[0].name}`
              : "",
          cell: (object, context) => {
            const owner = object.metadata?.ownerReferences?.[0];
            if (!owner) return <TextCell>–</TextCell>;
            return (
              <button
                type="button"
                className="truncate text-left text-accent-text hover:underline"
                title={`Open owner ${owner.kind}/${owner.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  context.onOpenRef?.({
                    kind: owner.kind,
                    apiVersion: owner.apiVersion,
                    namespace: owner.namespace ?? object.metadata?.namespace,
                    name: owner.name,
                  });
                }}
              >
                {owner.kind}/{owner.name}
              </button>
            );
          },
        },
        {
          key: "node",
          label: "Node",
          width: 200,
          sortable: true,
          value: (object) => object.spec?.nodeName ?? "",
          cell: (object, context) =>
            object.spec?.nodeName ? (
              <button
                type="button"
                className="truncate text-left text-accent-text hover:underline"
                title={`Open node ${object.spec.nodeName}`}
                onClick={(event) => {
                  event.stopPropagation();
                  context.onOpenNode?.(object.spec.nodeName);
                }}
              >
                {object.spec.nodeName}
              </button>
            ) : (
              <TextCell>–</TextCell>
            ),
          filterValue: (object) => object.spec?.nodeName,
        },
        {
          key: "podIP",
          label: "Pod IP",
          width: 132,
          defaultHidden: true,
          value: (object) => object.status?.podIP ?? "",
          cell: (object) => <Mono>{object.status?.podIP ?? "–"}</Mono>,
        },
        {
          key: "qos",
          label: "QoS",
          width: 104,
          defaultHidden: true,
          value: (object) => object.status?.qosClass ?? "",
          cell: (object) => <TextCell>{object.status?.qosClass ?? "–"}</TextCell>,
          filterValue: (object) => object.status?.qosClass,
        },
      );
      break;
    }
    case "deployment":
    case "statefulset": {
      base.push(
        {
          key: "ready",
          label: "Ready",
          width: 96,
          align: "right",
          sortable: true,
          value: (object) => Number(object.status?.readyReplicas ?? 0),
          cell: (object) => (
            <span className="mono-nums text-theme-text-secondary">
              {object.status?.readyReplicas ?? 0}/{object.spec?.replicas ?? 0}
            </span>
          ),
        },
        statusColumn(kind, 150),
        {
          key: "upToDate",
          label: "Up-to-date",
          width: 104,
          align: "right",
          sortable: true,
          value: (object) => Number(object.status?.updatedReplicas ?? 0),
          cell: (object) => <Mono>{object.status?.updatedReplicas ?? 0}</Mono>,
        },
        {
          key: "available",
          label: "Available",
          width: 100,
          align: "right",
          sortable: true,
          value: (object) => Number(object.status?.availableReplicas ?? 0),
          cell: (object) => <Mono>{object.status?.availableReplicas ?? 0}</Mono>,
        },
        {
          key: "images",
          label: "Images",
          width: 280,
          defaultHidden: true,
          value: (object) =>
            ((object.spec?.template?.spec?.containers ?? []) as Array<{ image?: string }>)
              .map((container) => container.image)
              .join(", "),
          cell: (object) => {
            const images = ((object.spec?.template?.spec?.containers ?? []) as Array<{ image?: string }>).map(
              (container) => container.image,
            );
            return <TextCell title={images.join("\n")}>{images.join(", ") || "–"}</TextCell>;
          },
        },
      );
      break;
    }
    case "daemonset": {
      base.push(
        {
          key: "desired",
          label: "Desired",
          width: 88,
          align: "right",
          sortable: true,
          value: (object) => Number(object.status?.desiredNumberScheduled ?? 0),
          cell: (object) => <Mono>{object.status?.desiredNumberScheduled ?? 0}</Mono>,
        },
        {
          key: "ready",
          label: "Ready",
          width: 80,
          align: "right",
          sortable: true,
          value: (object) => Number(object.status?.numberReady ?? 0),
          cell: (object) => <Mono>{object.status?.numberReady ?? 0}</Mono>,
        },
        {
          key: "updated",
          label: "Up-to-date",
          width: 104,
          align: "right",
          sortable: true,
          value: (object) => Number(object.status?.updatedNumberScheduled ?? 0),
          cell: (object) => <Mono>{object.status?.updatedNumberScheduled ?? 0}</Mono>,
        },
        statusColumn(kind, 150),
      );
      break;
    }
    case "replicaset": {
      base.push(
        {
          key: "desired",
          label: "Desired",
          width: 88,
          align: "right",
          sortable: true,
          value: (object) => Number(object.spec?.replicas ?? 0),
          cell: (object) => <Mono>{object.spec?.replicas ?? 0}</Mono>,
        },
        {
          key: "current",
          label: "Current",
          width: 88,
          align: "right",
          sortable: true,
          value: (object) => Number(object.status?.replicas ?? 0),
          cell: (object) => <Mono>{object.status?.replicas ?? 0}</Mono>,
        },
        {
          key: "ready",
          label: "Ready",
          width: 80,
          align: "right",
          sortable: true,
          value: (object) => Number(object.status?.readyReplicas ?? 0),
          cell: (object) => <Mono>{object.status?.readyReplicas ?? 0}</Mono>,
        },
        statusColumn(kind, 150),
      );
      break;
    }
    case "job": {
      base.push(
        statusColumn(kind, 140),
        {
          key: "completions",
          label: "Completions",
          width: 104,
          align: "right",
          sortable: true,
          value: (object) => Number(object.status?.succeeded ?? 0),
          cell: (object) => (
            <span className="mono-nums text-theme-text-secondary">
              {object.status?.succeeded ?? 0}/{object.spec?.completions ?? 1}
            </span>
          ),
        },
        {
          key: "duration",
          label: "Duration",
          width: 100,
          align: "right",
          sortable: true,
          value: (object) => {
            const start = new Date(object.status?.startTime ?? object.metadata?.creationTimestamp ?? 0).getTime();
            const end = object.status?.completionTime ? new Date(object.status.completionTime).getTime() : Date.now();
            return Math.max(0, Math.round((end - start) / 1000));
          },
          cell: (object) => {
            const start = new Date(object.status?.startTime ?? object.metadata?.creationTimestamp ?? 0).getTime();
            const end = object.status?.completionTime ? new Date(object.status.completionTime).getTime() : Date.now();
            const seconds = Math.max(0, Math.round((end - start) / 1000));
            return <Mono>{formatDurationSeconds(seconds)}</Mono>;
          },
        },
        {
          key: "owner",
          label: "Owner",
          width: 200,
          defaultHidden: true,
          value: (object) => object.metadata?.ownerReferences?.[0]?.name ?? "",
          cell: (object) => <TextCell>{object.metadata?.ownerReferences?.[0]?.name ?? "–"}</TextCell>,
          filterValue: (object) => object.metadata?.ownerReferences?.[0]?.kind,
        },
      );
      break;
    }
    case "cronjob": {
      base.push(
        statusColumn(kind, 130),
        {
          key: "schedule",
          label: "Schedule",
          width: 148,
          sortable: true,
          value: (object) => object.spec?.schedule ?? "",
          cell: (object) => <Mono>{object.spec?.schedule ?? "–"}</Mono>,
          filterValue: (object) => object.spec?.schedule,
        },
        {
          key: "suspend",
          label: "Suspend",
          width: 84,
          sortable: true,
          value: (object) => (object.spec?.suspend ? 1 : 0),
          cell: (object) => <TextCell>{object.spec?.suspend ? "Yes" : "No"}</TextCell>,
          filterValue: (object) => (object.spec?.suspend ? "Yes" : "No"),
        },
        {
          key: "active",
          label: "Active",
          width: 76,
          align: "right",
          sortable: true,
          value: (object) => Number(object.status?.active?.length ?? 0),
          cell: (object) => <Mono>{object.status?.active?.length ?? 0}</Mono>,
        },
        {
          key: "lastSchedule",
          label: "Last schedule",
          width: 140,
          sortable: true,
          value: (object) => object.status?.lastScheduleTime ?? "",
          cell: (object) => (
            <span className="text-xs text-theme-text-tertiary" title={formatTimestamp(object.status?.lastScheduleTime)}>
              {formatRelativeTime(object.status?.lastScheduleTime)}
            </span>
          ),
        },
      );
      break;
    }
    case "service": {
      base.push(
        {
          key: "type",
          label: "Type",
          width: 132,
          sortable: true,
          value: (object) => object.spec?.type ?? "ClusterIP",
          cell: (object) => <ServiceTypeCell object={object} />,
          filterValue: (object) => object.spec?.type ?? "ClusterIP",
        },
        {
          key: "selector",
          label: "Selector",
          width: 230,
          value: (object) =>
            Object.entries((object.spec?.selector ?? {}) as Record<string, string>)
              .map(([key, value]) => `${key}=${value}`)
              .join(","),
          cell: (object) => {
            const entries = Object.entries((object.spec?.selector ?? {}) as Record<string, string>);
            return <TextCell title={entries.map(([key, value]) => `${key}=${value}`).join("\n")}>{entries.map(([key, value]) => `${key}=${value}`).join(", ") || "–"}</TextCell>;
          },
          filterValue: (object) =>
            Object.entries((object.spec?.selector ?? {}) as Record<string, string>)
              .map(([key, value]) => `${key}=${value}`)
              .join(","),
        },
        {
          key: "endpoints",
          label: "Endpoints",
          width: 140,
          tooltip: "Addresses behind this Service, from its Endpoints object (Active / None / External)",
          sortable: true,
          value: (object, context) => serviceEndpointsValue(object, context)?.label ?? "",
          cell: (object, context) => <ServiceEndpointsCell object={object} context={context} />,
          filterValue: (object, context) => serviceEndpointsValue(object, context)?.label,
        },
        {
          key: "ports",
          label: "Ports",
          width: 140,
          value: (object) =>
            ((object.spec?.ports ?? []) as Array<{ port: number; protocol?: string; nodePort?: number }>)
              .map((port) => `${port.port}${port.nodePort ? `:${port.nodePort}` : ""}/${port.protocol ?? "TCP"}`)
              .join(", "),
          cell: (object) => {
            const ports = (object.spec?.ports ?? []) as Array<{
              port: number;
              protocol?: string;
              nodePort?: number;
            }>;
            return <TextCell>{ports.map((port) => `${port.port}/${port.protocol ?? "TCP"}`).join(", ") || "–"}</TextCell>;
          },
        },
        {
          key: "external",
          label: "External",
          width: 190,
          tooltip: "Load balancer IPs or hostnames assigned to this Service",
          value: (object) => externalAddresses(object).join(", "),
          cell: (object) => {
            const entries = externalAddresses(object);
            return entries.length ? (
              <Mono>{entries.join(", ")}</Mono>
            ) : (
              <span className="text-sm text-theme-text-tertiary">–</span>
            );
          },
        },
        {
          key: "clusterIP",
          label: "Cluster IP",
          width: 140,
          defaultHidden: true,
          value: (object) => object.spec?.clusterIP ?? "",
          cell: (object) => <Mono>{object.spec?.clusterIP ?? "–"}</Mono>,
        },
      );
      break;
    }
    case "ingress": {
      base.push(
        {
          key: "class",
          label: "Class",
          width: 148,
          sortable: true,
          value: (object) => object.spec?.ingressClassName ?? "",
          cell: (object) => <TextCell>{object.spec?.ingressClassName ?? "–"}</TextCell>,
          filterValue: (object) => object.spec?.ingressClassName,
        },
        {
          key: "hosts",
          label: "Hosts",
          width: 260,
          value: (object) =>
            ((object.spec?.rules ?? []) as Array<{ host?: string }>).map((rule) => rule.host ?? "*").join(", "),
          cell: (object) => {
            const hosts = ((object.spec?.rules ?? []) as Array<{ host?: string }>).map((rule) => rule.host ?? "*");
            return <TextCell title={hosts.join("\n")}>{hosts.join(", ") || "–"}</TextCell>;
          },
        },
        {
          key: "address",
          label: "Address",
          width: 190,
          value: (object) => {
            const ingress = object.status?.loadBalancer?.ingress?.[0];
            return ingress?.ip ?? ingress?.hostname ?? "";
          },
          cell: (object) => {
            const ingress = object.status?.loadBalancer?.ingress?.[0];
            return <Mono>{ingress?.ip ?? ingress?.hostname ?? "–"}</Mono>;
          },
        },
        statusColumn(kind, 110),
      );
      break;
    }
    case "networkpolicy": {
      base.push(
        {
          key: "podSelector",
          label: "Pod selector",
          width: 260,
          value: (object) =>
            Object.entries((object.spec?.podSelector?.matchLabels ?? {}) as Record<string, string>)
              .map(([key, value]) => `${key}=${value}`)
              .join(","),
          cell: (object) => {
            const labels = Object.entries((object.spec?.podSelector?.matchLabels ?? {}) as Record<string, string>);
            return <TextCell title={labels.map(([key, value]) => `${key}=${value}`).join("\n")}>{labels.map(([key, value]) => `${key}=${value}`).join(", ") || "All pods"}</TextCell>;
          },
        },
        {
          key: "types",
          label: "Policy types",
          width: 200,
          value: (object) => (object.spec?.policyTypes ?? []).join(", "),
          cell: (object) => <TextCell>{(object.spec?.policyTypes ?? []).join(", ") || "–"}</TextCell>,
        },
        ageColumn,
      );
      break;
    }
    case "configmap": {
      base.push(
        {
          key: "keys",
          label: "Keys",
          width: 88,
          align: "right",
          sortable: true,
          value: (object) => Object.keys(object.data ?? {}).length + Object.keys(object.binaryData ?? {}).length,
          cell: (object) => (
            <Mono>{Object.keys(object.data ?? {}).length + Object.keys(object.binaryData ?? {}).length}</Mono>
          ),
        },
        {
          key: "size",
          label: "Size",
          width: 104,
          align: "right",
          sortable: true,
          tooltip:
            "Estimated size of data values, including decoded binary data. Kubernetes rejects ConfigMaps whose combined data exceeds 1 MiB.",
          value: (object) => configMapBytes(object),
          cell: (object) => <Mono>{formatBytes(configMapBytes(object))}</Mono>,
        },
        {
          key: "immutable",
          label: "Immutable",
          width: 100,
          defaultHidden: true,
          value: (object) => (object.immutable ? "Yes" : "No"),
          cell: (object) => <TextCell>{object.immutable ? "Yes" : "No"}</TextCell>,
        },
      );
      break;
    }
    case "secret": {
      base.push(
        {
          key: "type",
          label: "Type",
          width: 132,
          sortable: true,
          value: (object) => object.type ?? "Opaque",
          cell: (object) => <SecretTypeCell object={object} />,
          filterValue: (object) => object.type ?? "Opaque",
        },
        {
          key: "keys",
          label: "Keys",
          width: 88,
          align: "right",
          sortable: true,
          value: (object) => Object.keys(object.data ?? {}).length,
          cell: (object) => <Mono>{Object.keys(object.data ?? {}).length}</Mono>,
        },
        {
          key: "expires",
          label: "Expires",
          width: 132,
          tooltip:
            "Days until the certificate in a TLS Secret expires. Blank for Secrets carrying no readable TLS certificate; ! means the expiry lookup itself failed.",
          sortable: true,
          value: (object) => secretCertificate(object)?.expires?.getTime(),
          cell: (object) => <SecretExpiresCell object={object} />,
          filterValue: (object) => {
            const cert = secretCertificate(object);
            if (!cert || cert.days === null || cert.failed) return undefined;
            return cert.days < 0 ? "expired" : cert.days < 30 ? "expiring" : "valid";
          },
        },
      );
      break;
    }
    case "node": {
      base.push(
        statusColumn("Node", 168),
        {
          key: "roles",
          label: "Roles",
          width: 150,
          value: (object) => nodeRoles(object).join(", "),
          cell: (object) => <TextCell>{nodeRoles(object).join(", ") || "<none>"}</TextCell>,
          filterValue: (object) => nodeRoles(object)[0],
        },
        {
          key: "cpu",
          label: "CPU",
          width: 196,
          tooltip: "Current CPU usage / allocatable",
          sortable: true,
          value: (object, context) => {
            const sample = context?.nodeMetrics?.get(object.metadata?.name ?? "");
            if (sample && sample.cpu > 0) return sample.cpu;
            return parseCpu(object.status?.allocatable?.cpu) ?? 0;
          },
          cell: (object, context) => {
            const sample = context.nodeMetrics?.get(object.metadata?.name ?? "");
            const allocatable = parseCpu(object.status?.allocatable?.cpu) ?? 0;
            if (!sample || sample.cpu <= 0 || allocatable <= 0) {
              return <span className="text-sm text-theme-text-tertiary">–</span>;
            }
            return (
              <ResourceBar
                used={formatCpu(sample.cpu)}
                total={formatCpu(allocatable)}
                percent={(sample.cpu / allocatable) * 100}
              />
            );
          },
        },
        {
          key: "memory",
          label: "Memory",
          width: 196,
          tooltip: "Current memory usage / allocatable",
          sortable: true,
          value: (object, context) => {
            const sample = context?.nodeMetrics?.get(object.metadata?.name ?? "");
            if (sample && sample.memory > 0) return sample.memory;
            return parseMemory(object.status?.allocatable?.memory) ?? 0;
          },
          cell: (object, context) => {
            const sample = context.nodeMetrics?.get(object.metadata?.name ?? "");
            const allocatable = parseMemory(object.status?.allocatable?.memory) ?? 0;
            if (!sample || sample.memory <= 0 || allocatable <= 0) {
              return <span className="text-sm text-theme-text-tertiary">–</span>;
            }
            return (
              <ResourceBar
                used={formatBytes(sample.memory)}
                total={formatBytes(allocatable)}
                percent={(sample.memory / allocatable) * 100}
              />
            );
          },
        },
        {
          key: "pods",
          label: "Pods",
          width: 88,
          align: "right",
          sortable: true,
          value: (object) => parseCpu(object.status?.capacity?.pods) ?? 0,
          cell: (object) => <Mono>{object.status?.capacity?.pods ?? "–"}</Mono>,
        },
        {
          key: "conditions",
          label: "Conditions",
          width: 190,
          value: (object) => nodeConditionSummary(object).text,
          cell: (object) => <NodeConditionsCell object={object} />,
          filterValue: (object) => nodeConditionSummary(object).text,
        },
        {
          key: "taints",
          label: "Taints",
          width: 170,
          value: (object) => nodeTaints(object).map((taint) => taint.text).join(", "),
          cell: (object) => <NodeTaintsCell object={object} />,
          filterValue: (object) => nodeTaints(object).map((taint) => taint.effect).join(",") || "none",
        },
        {
          key: "version",
          label: "Version",
          width: 120,
          sortable: true,
          value: (object) => object.status?.nodeInfo?.kubeletVersion ?? "",
          cell: (object) => <Mono>{object.status?.nodeInfo?.kubeletVersion ?? "–"}</Mono>,
          filterValue: (object) => object.status?.nodeInfo?.kubeletVersion,
        },
        {
          key: "os",
          label: "OS",
          width: 100,
          defaultHidden: true,
          value: (object) => object.status?.nodeInfo?.osImage ?? "",
          cell: (object) => <TextCell>{object.status?.nodeInfo?.osImage ?? "–"}</TextCell>,
        },
      );
      break;
    }
    case "namespace": {
      base.push(
        statusColumn("Namespace", 130),
        {
          key: "labels",
          label: "Labels",
          width: 240,
          defaultHidden: true,
          value: (object) => Object.keys(object.metadata?.labels ?? {}).length,
          cell: (object) => <TextCell>{Object.keys(object.metadata?.labels ?? {}).length || "–"}</TextCell>,
        },
      );
      break;
    }
    case "event": {
      base.push(
        statusColumn("Event", 100),
        {
          key: "reason",
          label: "Reason",
          width: 200,
          sortable: true,
          value: (object) => object.reason ?? "",
          cell: (object) => <TextCell>{object.reason ?? "–"}</TextCell>,
          filterValue: (object) => object.reason,
        },
        {
          key: "object",
          label: "Object",
          width: 240,
          value: (object) =>
            object.involvedObject ? `${object.involvedObject.kind}/${object.involvedObject.name}` : "",
          cell: (object) => (
            <TextCell>
              {object.involvedObject ? `${object.involvedObject.kind}/${object.involvedObject.name}` : "–"}
            </TextCell>
          ),
          filterValue: (object) => object.involvedObject?.kind,
        },
        {
          key: "message",
          label: "Message",
          width: 420,
          value: (object) => object.message ?? "",
          cell: (object) => <TextCell title={object.message}>{object.message ?? "–"}</TextCell>,
        },
        {
          key: "count",
          label: "Count",
          width: 72,
          align: "right",
          sortable: true,
          value: (object) => Number(object.count ?? 1),
          cell: (object) => <Mono>{object.count ?? 1}</Mono>,
        },
        {
          key: "lastSeen",
          label: "Last seen",
          width: 120,
          sortable: true,
          value: (object) => object.lastTimestamp ?? object.eventTime ?? "",
          cell: (object) => (
            <span className="text-xs text-theme-text-tertiary">
              {formatRelativeTime(object.lastTimestamp ?? object.eventTime)}
            </span>
          ),
        },
      );
      break;
    }
    case "persistentvolumeclaim": {
      base.push(
        statusColumn("PersistentVolumeClaim", 112),
        {
          key: "pods",
          label: "Pods",
          width: 220,
          value: (object, context) =>
            (context?.claimPods?.get(`${object.metadata?.namespace}/${object.metadata?.name}`) ?? []).join(","),
          cell: (object, context) => {
            const names = context.claimPods?.get(`${object.metadata?.namespace}/${object.metadata?.name}`) ?? [];
            if (names.length === 0) return <TextCell>–</TextCell>;
            return (
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                {names.slice(0, 3).map((name) => (
                  <button
                    key={name}
                    type="button"
                    className="truncate text-left text-accent-text hover:underline"
                    title={`Open pod ${name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      context.onOpenRef?.({ kind: "Pod", namespace: object.metadata?.namespace, name });
                    }}
                  >
                    {name}
                  </button>
                ))}
                {names.length > 3 ? (
                  <span className="text-[10px] text-theme-text-disabled">+{names.length - 3}</span>
                ) : null}
              </div>
            );
          },
          filterValue: (object, context) =>
            (context?.claimPods?.get(`${object.metadata?.namespace}/${object.metadata?.name}`) ?? []).join(","),
        },
        {
          key: "volume",
          label: "Volume",
          width: 200,
          value: (object) => object.spec?.volumeName ?? "",
          cell: (object, context) =>
            object.spec?.volumeName ? (
              <button
                type="button"
                className="truncate text-left font-mono text-accent-text hover:underline"
                title={`Open PersistentVolume ${object.spec.volumeName}`}
                onClick={(event) => {
                  event.stopPropagation();
                  context.onOpenRef?.({ kind: "PersistentVolume", name: object.spec.volumeName });
                }}
              >
                {object.spec.volumeName}
              </button>
            ) : (
              <Mono>–</Mono>
            ),
          filterValue: (object) => object.spec?.volumeName,
        },
        {
          key: "capacity",
          label: "Capacity",
          width: 100,
          align: "right",
          sortable: true,
          value: (object) => parseMemory(object.status?.capacity?.storage) ?? 0,
          cell: (object) => <Mono>{object.status?.capacity?.storage ?? "–"}</Mono>,
        },
        {
          key: "accessModes",
          label: "Access modes",
          width: 130,
          value: (object) => (object.spec?.accessModes ?? []).join(", "),
          cell: (object) => <TextCell>{(object.spec?.accessModes ?? []).join(", ") || "–"}</TextCell>,
        },
        {
          key: "storageClass",
          label: "Storage class",
          width: 160,
          sortable: true,
          value: (object) => object.spec?.storageClassName ?? "",
          cell: (object, context) =>
            object.spec?.storageClassName ? (
              <button
                type="button"
                className="truncate text-left text-accent-text hover:underline"
                title={`Open StorageClass ${object.spec.storageClassName}`}
                onClick={(event) => {
                  event.stopPropagation();
                  context.onOpenRef?.({ kind: "StorageClass", name: object.spec.storageClassName });
                }}
              >
                {object.spec.storageClassName}
              </button>
            ) : (
              <TextCell>–</TextCell>
            ),
          filterValue: (object) => object.spec?.storageClassName,
        },
      );
      break;
    }
    case "persistentvolume": {
      base.push(
        statusColumn("PersistentVolume", 112),
        {
          key: "capacity",
          label: "Capacity",
          width: 100,
          align: "right",
          sortable: true,
          value: (object) => parseMemory(object.spec?.capacity?.storage) ?? 0,
          cell: (object) => <Mono>{object.spec?.capacity?.storage ?? "–"}</Mono>,
        },
        {
          key: "accessModes",
          label: "Access modes",
          width: 140,
          value: (object) => (object.spec?.accessModes ?? []).join(", "),
          cell: (object) => <TextCell>{(object.spec?.accessModes ?? []).join(", ") || "–"}</TextCell>,
        },
        {
          key: "reclaim",
          label: "Reclaim",
          width: 110,
          sortable: true,
          value: (object) => object.spec?.persistentVolumeReclaimPolicy ?? "",
          cell: (object) => <TextCell>{object.spec?.persistentVolumeReclaimPolicy ?? "–"}</TextCell>,
          filterValue: (object) => object.spec?.persistentVolumeReclaimPolicy,
        },
        {
          key: "claim",
          label: "Claim",
          width: 200,
          value: (object) => object.spec?.claimRef?.name ?? "",
          cell: (object) => <TextCell>{object.spec?.claimRef?.name ?? "–"}</TextCell>,
        },
        {
          key: "storageClass",
          label: "Storage class",
          width: 160,
          sortable: true,
          value: (object) => object.spec?.storageClassName ?? "",
          cell: (object, context) =>
            object.spec?.storageClassName ? (
              <button
                type="button"
                className="truncate text-left text-accent-text hover:underline"
                title={`Open StorageClass ${object.spec.storageClassName}`}
                onClick={(event) => {
                  event.stopPropagation();
                  context.onOpenRef?.({ kind: "StorageClass", name: object.spec.storageClassName });
                }}
              >
                {object.spec.storageClassName}
              </button>
            ) : (
              <TextCell>–</TextCell>
            ),
          filterValue: (object) => object.spec?.storageClassName,
        },
      );
      break;
    }
    case "storageclass": {
      base.push(
        {
          key: "provisioner",
          label: "Provisioner",
          width: 260,
          sortable: true,
          value: (object) => object.provisioner ?? "",
          cell: (object) => <TextCell>{object.provisioner ?? "–"}</TextCell>,
          filterValue: (object) => object.provisioner,
        },
        {
          key: "reclaim",
          label: "Reclaim",
          width: 110,
          value: (object) => object.reclaimPolicy ?? "Delete",
          cell: (object) => <TextCell>{object.reclaimPolicy ?? "Delete"}</TextCell>,
        },
        {
          key: "binding",
          label: "Volume binding",
          width: 150,
          value: (object) => object.volumeBindingMode ?? "Immediate",
          cell: (object) => <TextCell>{object.volumeBindingMode ?? "Immediate"}</TextCell>,
        },
        {
          key: "default",
          label: "Default",
          width: 90,
          value: (object) =>
            object.metadata?.annotations?.["storageclass.kubernetes.io/is-default-class"] === "true" ? "Yes" : "",
          cell: (object) =>
            object.metadata?.annotations?.["storageclass.kubernetes.io/is-default-class"] === "true" ? (
              <span className="badge status-neutral">default</span>
            ) : (
              <span className="text-sm text-theme-text-tertiary">–</span>
            ),
        },
      );
      break;
    }
    case "serviceaccount": {
      base.push(
        {
          key: "automount",
          label: "Automount",
          width: 124,
          tooltip:
            "Default automatic API-token mounting for pods using this ServiceAccount. A pod can override this setting.",
          value: (object) => (object.automountServiceAccountToken === false ? "No" : "Yes"),
          cell: (object) => {
            const off = object.automountServiceAccountToken === false;
            return (
              <span className={cn("badge-sm", off ? "status-healthy" : "status-degraded")}>
                {off ? "No" : "Yes"}
              </span>
            );
          },
          filterValue: (object) => (object.automountServiceAccountToken === false ? "No" : "Yes"),
        },
        {
          key: "secrets",
          label: "Secrets",
          width: 88,
          align: "right",
          sortable: true,
          value: (object) => Number(object.secrets?.length ?? 0),
          cell: (object) => <Mono>{object.secrets?.length ?? 0}</Mono>,
        },
      );
      break;
    }
    case "role":
    case "clusterrole": {
      base.push(
        {
          key: "rules",
          label: "Rules",
          width: 88,
          align: "right",
          sortable: true,
          value: (object) => Number(object.rules?.length ?? 0),
          cell: (object) => <Mono>{object.rules?.length ?? 0}</Mono>,
        },
        {
          key: "resources",
          label: "Resources",
          width: 320,
          defaultHidden: true,
          value: (object) =>
            [...new Set((object.rules ?? []).flatMap((rule: any) => rule.resources ?? []))].join(", "),
          cell: (object) => (
            <TextCell>
              {[...new Set((object.rules ?? []).flatMap((rule: any) => rule.resources ?? []))].join(", ") || "–"}
            </TextCell>
          ),
        },
      );
      break;
    }
    case "rolebinding":
    case "clusterrolebinding": {
      base.push(
        {
          key: "role",
          label: "Role",
          width: 240,
          value: (object) => object.roleRef?.name ?? "",
          cell: (object) => <RoleRefCell object={object} />,
          filterValue: (object) => object.roleRef?.name,
        },
        {
          key: "subjects",
          label: "Subjects",
          width: 260,
          value: (object) => (object.subjects ?? []).map((subject: any) => subject.name).join(", "),
          cell: (object) => <SubjectsCell object={object} />,
          filterValue: (object) => (object.subjects ?? []).map((subject: any) => subject.name).join(", "),
        },
      );
      break;
    }
    case "horizontalpodautoscaler": {
      base.push(
        statusColumn("HorizontalPodAutoscaler", 130),
        {
          key: "reference",
          label: "Reference",
          width: 240,
          value: (object) =>
            object.spec?.scaleTargetRef ? `${object.spec.scaleTargetRef.kind}/${object.spec.scaleTargetRef.name}` : "",
          cell: (object) => (
            <TextCell>
              {object.spec?.scaleTargetRef
                ? `${object.spec.scaleTargetRef.kind}/${object.spec.scaleTargetRef.name}`
                : "–"}
            </TextCell>
          ),
        },
        {
          key: "replicas",
          label: "Replicas",
          width: 120,
          align: "right",
          sortable: true,
          value: (object) => Number(object.status?.currentReplicas ?? 0),
          cell: (object) => (
            <span className="mono-nums text-theme-text-secondary">
              {object.status?.currentReplicas ?? 0} / {object.status?.desiredReplicas ?? 0}
            </span>
          ),
        },
        {
          key: "range",
          label: "Min / Max",
          width: 110,
          align: "right",
          value: (object) => Number(object.spec?.minReplicas ?? 1),
          cell: (object) => (
            <Mono>
              {object.spec?.minReplicas ?? 1} / {object.spec?.maxReplicas ?? "–"}
            </Mono>
          ),
        },
      );
      break;
    }
    case "poddisruptionbudget": {
      base.push(
        statusColumn("PodDisruptionBudget", 190),
        {
          key: "budget",
          label: "Budget",
          width: 170,
          value: (object) =>
            object.spec?.minAvailable
              ? `min ${object.spec.minAvailable}`
              : `max unavailable ${object.spec?.maxUnavailable ?? "–"}`,
          cell: (object) => (
            <TextCell>
              {object.spec?.minAvailable
                ? `min available ${object.spec.minAvailable}`
                : `max unavailable ${object.spec?.maxUnavailable ?? "–"}`}
            </TextCell>
          ),
        },
        {
          key: "healthy",
          label: "Healthy",
          width: 90,
          align: "right",
          sortable: true,
          value: (object) => Number(object.status?.currentHealthy ?? 0),
          cell: (object) => <Mono>{object.status?.currentHealthy ?? 0}</Mono>,
        },
        {
          key: "disruptions",
          label: "Allowed",
          width: 90,
          align: "right",
          sortable: true,
          value: (object) => Number(object.status?.disruptionsAllowed ?? 0),
          cell: (object) => <Mono>{object.status?.disruptionsAllowed ?? 0}</Mono>,
        },
      );
      break;
    }
    case "customresourcedefinition": {
      base.push(
        {
          key: "kind",
          label: "Kind",
          width: 190,
          sortable: true,
          tooltip: "The kind this definition creates",
          value: (object) => object.spec?.names?.kind ?? "",
          cell: (object) => <TextCell>{object.spec?.names?.kind ?? "–"}</TextCell>,
          filterValue: (object) => object.spec?.names?.kind,
        },
        {
          key: "group",
          label: "Group",
          width: 220,
          sortable: true,
          value: (object) => object.spec?.group ?? "",
          cell: (object) => <TextCell>{object.spec?.group ?? "–"}</TextCell>,
          filterValue: (object) => object.spec?.group,
        },
        {
          key: "scope",
          label: "Scope",
          width: 110,
          value: (object) => object.spec?.scope ?? "",
          cell: (object) => <TextCell>{object.spec?.scope ?? "–"}</TextCell>,
        },
        {
          key: "versions",
          label: "Versions",
          width: 200,
          value: (object) =>
            (object.spec?.versions ?? []).map((version: any) => `${version.name}${version.storage ? " (s)" : ""}`).join(", "),
          cell: (object) => (
            <TextCell>
              {(object.spec?.versions ?? []).map((version: any) => version.name).join(", ") || "–"}
            </TextCell>
          ),
        },
        statusColumn("CustomResourceDefinition", 168),
      );
      break;
    }
    case "helmrelease": {
      base.push(
        {
          key: "status",
          label: "Status",
          width: 148,
          sortable: true,
          value: (object) => String(object.status?.phase ?? "unknown"),
          cell: (object) => <HelmStatusCell object={object} />,
          filterValue: (object) => String(object.status?.phase ?? "unknown"),
        },
        {
          key: "chart",
          label: "Chart",
          width: 240,
          sortable: true,
          value: (object) => String(object.spec?.chart ?? ""),
          cell: (object) => <TextCell>{String(object.spec?.chart ?? "–")}</TextCell>,
          filterValue: (object) => String(object.spec?.chartName ?? ""),
        },
        {
          key: "revision",
          label: "Revision",
          width: 96,
          align: "right",
          sortable: true,
          value: (object) => Number(object.spec?.revision ?? 1),
          cell: (object) => <Mono>{String(object.spec?.revision ?? 1)}</Mono>,
        },
        {
          key: "appVersion",
          label: "App version",
          width: 128,
          sortable: true,
          value: (object) => String(object.spec?.appVersion ?? ""),
          cell: (object) => <TextCell>{String(object.spec?.appVersion || "–")}</TextCell>,
          filterValue: (object) => String(object.spec?.appVersion ?? "") || undefined,
        },
      );
      break;
    }
    default: {
      base.push(statusColumn(kind, 180));
      for (const printer of resource.printerColumns ?? []) {
        if ((printer.priority ?? 0) > 0) continue;
        base.push({
          key: `printer:${printer.name}`,
          label: printer.name,
          width: 160,
          sortable: true,
          value: (object) => printerValue(object, printer.jsonPath, printer.type),
          cell: (object) => {
            const value = printerValue(object, printer.jsonPath, printer.type);
            if (printer.type === "date" && typeof value === "string" && value) {
              return <AgeCell object={{ ...object, metadata: { ...object.metadata, creationTimestamp: value } }} />;
            }
            return <TextCell>{value ?? "–"}</TextCell>;
          },
          filterValue: (object) => {
            const value = printerValue(object, printer.jsonPath, printer.type);
            return value === undefined ? undefined : String(value);
          },
        });
      }
      break;
    }
  }

  if (showNamespace && resource.namespaced) columns.push(namespaceColumn);
  if (WARNING_KINDS.has(kind)) base.push(warningsColumn());
  columns.push(...base.filter((column) => column.key !== "age"));
  columns.push(ageColumn);
  return columns;
}

export function nodeRoles(node: AnyObject): string[] {
  const labels = (node.metadata?.labels ?? {}) as Record<string, string>;
  return Object.keys(labels)
    .filter((key) => key.startsWith("node-role.kubernetes.io/"))
    .map((key) => key.replace("node-role.kubernetes.io/", ""))
    .filter(Boolean);
}

/** Pressure/network conditions that are only a problem while they are True. */
const NODE_PRESSURE_CONDITIONS = ["DiskPressure", "MemoryPressure", "PIDPressure", "NetworkUnavailable"];

/**
 * Radar's node conditions: genuine problems only — a cordoned node is an
 * intentional operator action and is surfaced by the Status badge instead.
 */
export function nodeConditionSummary(node: AnyObject): { healthy: boolean; problems: string[]; text: string } {
  const conditions = (node.status?.conditions ?? []) as Array<Record<string, any>>;
  const problems: string[] = [];
  let readiness = "Unknown";
  for (const condition of conditions) {
    if (condition.type === "Ready") {
      readiness = condition.status === "True" ? "Ready" : condition.status === "False" ? "NotReady" : "Unknown";
      if (condition.status !== "True") {
        problems.push(`Node is ${readiness}${condition.message ? `: ${condition.message}` : ""}`);
      }
    }
    if (condition.status === "True" && NODE_PRESSURE_CONDITIONS.includes(condition.type)) {
      const label =
        condition.type === "DiskPressure"
          ? "Disk pressure"
          : condition.type === "MemoryPressure"
            ? "Memory pressure"
            : condition.type === "PIDPressure"
              ? "PID pressure"
              : "Network unavailable";
      problems.push(`${label}${condition.message ? `: ${condition.message}` : ""}`);
    }
  }
  const healthy = problems.length === 0 && readiness === "Ready";
  return { healthy, problems, text: healthy ? "Healthy" : problems.length ? problems.join(", ") : readiness };
}

export interface NodeTaint {
  text: string;
  effect: string;
}

export function nodeTaints(node: AnyObject): NodeTaint[] {
  const taints = (node.spec?.taints ?? []) as Array<Record<string, any>>;
  return taints.map((taint) => ({
    text: `${taint.key ?? ""}${taint.value ? `=${taint.value}` : ""}:${taint.effect ?? "All"}`,
    effect: taint.effect ?? "All",
  }));
}

function NodeConditionsCell({ object }: { object: AnyObject }) {
  const summary = nodeConditionSummary(object);
  if (summary.healthy) {
    return <span className="text-sm text-emerald-600 dark:text-emerald-400">Healthy</span>;
  }
  if (summary.problems.length > 0) {
    return (
      <span
        className="block truncate text-sm text-amber-600 dark:text-amber-400"
        title={summary.problems.join("\n")}
      >
        {summary.problems.join(", ")}
      </span>
    );
  }
  return <span className="text-sm text-theme-text-secondary">{summary.text}</span>;
}

function NodeTaintsCell({ object }: { object: AnyObject }) {
  const taints = nodeTaints(object);
  if (taints.length === 0) return <span className="text-sm text-theme-text-secondary">&lt;none&gt;</span>;
  const [first, ...rest] = taints;
  return (
    <span className="block truncate text-sm text-amber-600 dark:text-amber-400" title={taints.map((taint) => taint.text).join("\n")}>
      {first.text}
      {rest.length > 0 ? <span className="text-theme-text-tertiary"> +{rest.length}</span> : null}
    </span>
  );
}

function printerValue(object: AnyObject, jsonPath: string | undefined, type: string): string | number | undefined {
  if (!jsonPath) return undefined;
  const current = readJsonPath(object, jsonPath);
  if (current === undefined || current === null) return undefined;
  if (type === "integer" || type === "number") {
    const number = Number(current);
    return Number.isNaN(number) ? String(current) : number;
  }
  if (typeof current === "object") return JSON.stringify(current);
  return String(current);
}

export function sortObjects(
  objects: AnyObject[],
  column: ColumnDef | undefined,
  direction: "asc" | "desc",
  context?: CellContext,
): AnyObject[] {
  if (!column?.value) return objects;
  const factor = direction === "asc" ? 1 : -1;
  return [...objects].sort((a, b) => {
    const left = column.value!(a, context);
    const right = column.value!(b, context);
    if (typeof left === "number" && typeof right === "number") return (left - right) * factor;
    return String(left ?? "").localeCompare(String(right ?? ""), undefined, { numeric: true }) * factor;
  });
}

export function visibleColumns(columns: ColumnDef[], hidden: Set<string>): ColumnDef[] {
  return columns.filter((column) => !hidden.has(column.key));
}

export function formatColumnWidth(column: ColumnDef, override?: number): string {
  if (override) return `${override}px`;
  if (column.flex) return "minmax(220px, 1.6fr)";
  return `${column.width ?? 140}px`;
}

export function cpuFromObject(value: unknown): number | undefined {
  return typeof value === "string" ? parseCpu(value) : undefined;
}

export function memoryFromObject(value: unknown): number | undefined {
  return typeof value === "string" ? parseMemory(value) : undefined;
}

export function formatCapacity(value: string | undefined): string {
  if (!value) return "–";
  const bytes = parseMemory(value);
  return bytes === undefined ? value : formatBytes(bytes);
}
