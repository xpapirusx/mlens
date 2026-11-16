import type { ReactNode } from "react";
import { Copy } from "lucide-react";
import type { ApiResourceInfo } from "@shared/types";
import { formatAge, formatDurationSeconds, formatRelativeTime, formatTimestamp, parseCpu, parseMemory, formatBytes } from "./format";
import { resourceStatus, toneClass } from "./status";
import { cn } from "./cn";

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
  value?: (object: AnyObject) => string | number | undefined;
  cell: (object: AnyObject, context: CellContext) => ReactNode;
  filterValue?: (object: AnyObject) => string | undefined;
}

export interface CellContext {
  showNamespace: boolean;
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

function ContainersCell({ object }: { object: AnyObject }) {
  const statuses = podContainers(object);
  if (statuses.length === 0) return <span className="text-sm text-theme-text-tertiary">–</span>;
  return (
    <div className="flex items-center gap-1">
      {statuses.map((container) => {
        const waiting = container.state?.waiting?.reason;
        const terminated = container.state?.terminated?.reason;
        const tone = container.ready
          ? "bg-emerald-500"
          : waiting === "CrashLoopBackOff" || terminated === "OOMKilled"
            ? "bg-red-500"
            : "bg-amber-500";
        return (
          <span
            key={container.name}
            title={`${container.name}: ${container.ready ? "Ready" : (waiting ?? terminated ?? "Not ready")}${container.restartCount ? ` · restarts ${container.restartCount}` : ""}`}
            className={cn("h-3 w-1.5 rounded-[1px]", tone)}
          />
        );
      })}
      <span className="ml-1 font-mono text-[11px] text-theme-text-tertiary">
        {statuses.filter((container) => container.ready).length}/{statuses.length}
      </span>
    </div>
  );
}

const namespaceColumn: ColumnDef = {
  key: "namespace",
  label: "Namespace",
  width: 168,
  sortable: true,
  value: (object) => object.metadata?.namespace ?? "",
  cell: (object) => <TextCell>{object.metadata?.namespace ?? "–"}</TextCell>,
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
          width: 132,
          cell: (object) => <ContainersCell object={object} />,
          value: (object) => podContainers(object).filter((container) => container.ready).length,
        },
        statusColumn("Pod"),
        {
          key: "restarts",
          label: "Restarts",
          width: 104,
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
          key: "node",
          label: "Node",
          width: 200,
          sortable: true,
          value: (object) => object.spec?.nodeName ?? "",
          cell: (object) => <TextCell>{object.spec?.nodeName ?? "–"}</TextCell>,
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
          width: 116,
          sortable: true,
          value: (object) => object.spec?.type ?? "ClusterIP",
          cell: (object) => <TextCell>{object.spec?.type ?? "ClusterIP"}</TextCell>,
          filterValue: (object) => object.spec?.type ?? "ClusterIP",
        },
        {
          key: "clusterIP",
          label: "Cluster IP",
          width: 140,
          value: (object) => object.spec?.clusterIP ?? "",
          cell: (object) => <Mono>{object.spec?.clusterIP ?? "–"}</Mono>,
        },
        {
          key: "ports",
          label: "Ports",
          width: 190,
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
          key: "selector",
          label: "Selector",
          width: 230,
          defaultHidden: true,
          value: (object) =>
            Object.entries((object.spec?.selector ?? {}) as Record<string, string>)
              .map(([key, value]) => `${key}=${value}`)
              .join(","),
          cell: (object) => {
            const entries = Object.entries((object.spec?.selector ?? {}) as Record<string, string>);
            return <TextCell title={entries.map(([key, value]) => `${key}=${value}`).join("\n")}>{entries.map(([key, value]) => `${key}=${value}`).join(", ") || "–"}</TextCell>;
          },
        },
        statusColumn(kind, 100),
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
          width: 220,
          sortable: true,
          value: (object) => object.type ?? "",
          cell: (object) => <TextCell>{object.type ?? "–"}</TextCell>,
          filterValue: (object) => object.type,
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
          key: "version",
          label: "Version",
          width: 120,
          sortable: true,
          value: (object) => object.status?.nodeInfo?.kubeletVersion ?? "",
          cell: (object) => <Mono>{object.status?.nodeInfo?.kubeletVersion ?? "–"}</Mono>,
          filterValue: (object) => object.status?.nodeInfo?.kubeletVersion,
        },
        {
          key: "cpu",
          label: "CPU",
          width: 88,
          align: "right",
          sortable: true,
          value: (object) => parseCpu(object.status?.capacity?.cpu) ?? 0,
          cell: (object) => <Mono>{object.status?.capacity?.cpu ?? "–"}</Mono>,
        },
        {
          key: "memory",
          label: "Memory",
          width: 104,
          align: "right",
          sortable: true,
          value: (object) => parseMemory(object.status?.capacity?.memory) ?? 0,
          cell: (object) => <Mono>{object.status?.capacity?.memory ?? "–"}</Mono>,
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
          key: "volume",
          label: "Volume",
          width: 200,
          value: (object) => object.spec?.volumeName ?? "",
          cell: (object) => <Mono>{object.spec?.volumeName ?? "–"}</Mono>,
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
          cell: (object) => <TextCell>{object.spec?.storageClassName ?? "–"}</TextCell>,
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
          cell: (object) => <TextCell>{object.spec?.storageClassName ?? "–"}</TextCell>,
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
          key: "secrets",
          label: "Secrets",
          width: 88,
          align: "right",
          sortable: true,
          value: (object) => Number(object.secrets?.length ?? 0),
          cell: (object) => <Mono>{object.secrets?.length ?? 0}</Mono>,
        },
        {
          key: "automount",
          label: "Automount",
          width: 110,
          defaultHidden: true,
          value: (object) => (object.automountServiceAccountToken === false ? "No" : "Yes"),
          cell: (object) => <TextCell>{object.automountServiceAccountToken === false ? "No" : "Yes"}</TextCell>,
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
          width: 220,
          value: (object) => object.roleRef?.name ?? "",
          cell: (object) => <TextCell>{object.roleRef?.name ?? "–"}</TextCell>,
        },
        {
          key: "subjects",
          label: "Subjects",
          width: 320,
          value: (object) => (object.subjects ?? []).map((subject: any) => subject.name).join(", "),
          cell: (object) => (
            <TextCell>{(object.subjects ?? []).map((subject: any) => subject.name).join(", ") || "–"}</TextCell>
          ),
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

function printerValue(object: AnyObject, jsonPath: string | undefined, type: string): string | number | undefined {
  if (!jsonPath) return undefined;
  const path = jsonPath.replace(/^\{/, "").replace(/\}$/, "").replace(/^\./, "");
  let current: any = object;
  for (const token of path.split(".")) {
    if (current === undefined || current === null) return undefined;
    const match = /^([^[\]]+)((\[\d+\])*)$/.exec(token);
    if (!match) return undefined;
    current = current[match[1]];
    const indices = match[2].match(/\d+/g);
    if (indices) {
      for (const index of indices) {
        current = current?.[Number(index)];
      }
    }
  }
  if (current === undefined || current === null) return undefined;
  if (type === "integer" || type === "number") {
    const number = Number(current);
    return Number.isNaN(number) ? String(current) : number;
  }
  if (typeof current === "object") return JSON.stringify(current);
  return String(current);
}

export function sortObjects(objects: AnyObject[], column: ColumnDef | undefined, direction: "asc" | "desc"): AnyObject[] {
  if (!column?.value) return objects;
  const factor = direction === "asc" ? 1 : -1;
  return [...objects].sort((a, b) => {
    const left = column.value!(a);
    const right = column.value!(b);
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
