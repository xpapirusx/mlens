export type Tone = "success" | "warning" | "error" | "info" | "neutral" | "unknown" | "violet" | "orange";

export interface ResourceStatus {
  text: string;
  tone: Tone;
  detail?: string;
}

type AnyObject = any;

const TONE_TO_STATUS_CLASS: Record<Tone, string> = {
  success: "status-healthy",
  warning: "status-degraded",
  error: "status-unhealthy",
  info: "status-neutral",
  neutral: "status-unknown",
  unknown: "status-unknown",
  violet: "status-violet",
  orange: "status-orange",
};

export function toneClass(tone: Tone): string {
  return TONE_TO_STATUS_CLASS[tone] ?? "status-unknown";
}

export function toneTextClass(tone: Tone): string {
  switch (tone) {
    case "success":
      return "text-emerald-600 dark:text-emerald-400";
    case "warning":
      return "text-amber-600 dark:text-amber-400";
    case "error":
      return "text-red-600 dark:text-red-400";
    case "info":
      return "text-sky-600 dark:text-sky-400";
    case "violet":
      return "text-violet-600 dark:text-violet-400";
    case "orange":
      return "text-orange-600 dark:text-orange-400";
    default:
      return "text-theme-text-tertiary";
  }
}

function conditions(object: AnyObject): Array<Record<string, any>> {
  return Array.isArray(object.status?.conditions) ? object.status.conditions : [];
}

/**
 * Groups served by Kubernetes itself. A CRD may reuse a built-in kind name
 * (`Node`, `Service`, `Event`, …) in its own group; its objects do not have the
 * built-in status shape, so dispatching on the bare kind would label them
 * "Unknown". The API group, not the kind, decides which mapping applies.
 */
const BUILTIN_API_GROUPS = new Set([
  "",
  "apps",
  "batch",
  "autoscaling",
  "policy",
  "networking.k8s.io",
  "rbac.authorization.k8s.io",
  "storage.k8s.io",
  "apiextensions.k8s.io",
  "apiregistration.k8s.io",
  "coordination.k8s.io",
  "discovery.k8s.io",
  "events.k8s.io",
  "flowcontrol.apiserver.k8s.io",
  "node.k8s.io",
  "scheduling.k8s.io",
  "certificates.k8s.io",
  "admissionregistration.k8s.io",
  "authentication.k8s.io",
  "authorization.k8s.io",
  "resource.k8s.io",
  "internal.apiserver.k8s.io",
  "storagemigration.k8s.io",
  "metrics.k8s.io",
  "custom.metrics.k8s.io",
  "external.metrics.k8s.io",
]);

export function isBuiltinApiVersion(apiVersion?: string): boolean {
  // Partial objects (owner refs, synthetic rows) carry no apiVersion; keep the
  // kind-based behaviour rather than silently hiding a real status.
  if (!apiVersion) return true;
  const group = apiVersion.includes("/") ? apiVersion.slice(0, apiVersion.indexOf("/")) : "";
  return BUILTIN_API_GROUPS.has(group);
}

function usesBuiltinStatus(object: AnyObject): boolean {
  const apiVersion = typeof object?.apiVersion === "string" ? object.apiVersion : "";
  return isBuiltinApiVersion(apiVersion);
}

function condition(object: AnyObject, type: string): Record<string, any> | undefined {
  return conditions(object).find((entry) => entry.type === type);
}

/** Container states that always mean trouble, whatever the pod phase is. */
const FAILING_WAITING = new Set([
  "CrashLoopBackOff",
  "ImagePullBackOff",
  "ErrImagePull",
  "ErrImageNeverPull",
  "InvalidImageName",
  "CreateContainerConfigError",
  "CreateContainerError",
  "RunContainerError",
]);

const FAILING_TERMINATED = new Set(["OOMKilled", "Error", "ContainerCannotRun"]);

export function podStatus(pod: AnyObject): ResourceStatus {
  // Radar: deletion wins over everything, then a broken container, then phase.
  if (pod.metadata?.deletionTimestamp) return { text: "Terminating", tone: "warning" };

  const statuses = [
    ...(pod.status?.initContainerStatuses ?? []),
    ...(pod.status?.containerStatuses ?? []),
  ] as Array<Record<string, any>>;
  const initStatuses = (pod.status?.initContainerStatuses ?? []) as Array<Record<string, any>>;
  const appStatuses = (pod.status?.containerStatuses ?? []) as Array<Record<string, any>>;

  const failing = statuses.find((container) => {
    const waiting = container.state?.waiting?.reason;
    const terminated = container.state?.terminated?.reason;
    return (
      (waiting && FAILING_WAITING.has(waiting)) ||
      (terminated && FAILING_TERMINATED.has(terminated))
    );
  });

  if (failing) {
    const waiting = failing.state?.waiting?.reason;
    const terminated = failing.state?.terminated?.reason;
    return {
      text: waiting ?? terminated ?? "Error",
      tone: "error",
      detail: failing.state?.waiting?.message ?? failing.state?.terminated?.message ?? failing.name,
    };
  }

  const phase = pod.status?.phase ?? "Unknown";
  const reason = typeof pod.status?.reason === "string" ? pod.status.reason : undefined;
  const message = typeof pod.status?.message === "string" ? pod.status.message : undefined;

  if (phase === "Succeeded") return { text: "Completed", tone: "info" };
  if (phase === "Failed") {
    return {
      text: reason === "Evicted" ? "Evicted" : "Failed",
      tone: "error",
      detail: reason && reason !== "Failed" ? `${reason}${message ? ` · ${message}` : ""}` : message,
    };
  }

  if (phase === "Unknown") {
    // NodeLost / NodeShutdown / eviction in progress. Radar keeps these amber.
    return { text: reason ?? "Unknown", tone: "warning", detail: message };
  }

  if (phase === "Pending") {
    // The exact blocker is more useful than a generic "Pending".
    const waiting = statuses.map((container) => container.state?.waiting).find((state) => state?.reason);
    if (waiting?.reason) {
      return { text: waiting.reason, tone: "warning", detail: waiting.message };
    }
    const scheduling = condition(pod, "PodScheduled");
    if (scheduling?.status === "False") {
      return { text: "Scheduling", tone: "warning", detail: scheduling.reason ?? scheduling.message };
    }
    return { text: "Pending", tone: "warning", detail: message };
  }

  // The phase can already be "Running" while app containers are still in
  // PodInitializing/ContainerCreating (sidecars, slow init containers). The
  // container's waiting reason is the truth; never call that "Running".
  const waiting = statuses
    .map((container) => container.state?.waiting)
    .find((state) => state?.reason);
  if (waiting?.reason) {
    return { text: waiting.reason, tone: "warning", detail: waiting.message };
  }
  const initRunning = initStatuses.find((container) => container.state?.running);
  if (initRunning) {
    const name = initRunning.name ? `Init container ${initRunning.name}` : undefined;
    return { text: "PodInitializing", tone: "warning", detail: name };
  }

  const total = pod.spec?.containers?.length ?? appStatuses.length;
  const ready = appStatuses.filter((container) => container.ready).length;
  if (total > 0 && ready < total) return { text: `Running (${ready}/${total})`, tone: "warning" };
  return { text: "Running", tone: "success" };
}

export function workloadStatus(object: AnyObject): ResourceStatus {
  const desired = object.spec?.replicas ?? 0;
  const ready = object.status?.readyReplicas ?? 0;
  const available = object.status?.availableReplicas ?? ready;
  const updated = object.status?.updatedReplicas ?? ready;
  const generation = object.metadata?.generation;
  const observed = object.status?.observedGeneration;
  const failure = condition(object, "ReplicaFailure");
  const progressing = condition(object, "Progressing");
  const counts = `${ready}/${desired} ready · ${updated}/${desired} updated`;

  if (failure?.status === "True") {
    return { text: "Failed", tone: "error", detail: failure.reason ?? failure.message };
  }
  // A stalled rollout (ProgressDeadlineExceeded) is a failure, not "Updating".
  if (progressing?.status === "False") {
    return { text: progressing.reason ?? "Failed", tone: "error", detail: progressing.message };
  }
  if (desired === 0) return { text: "Scaled to 0", tone: "neutral" };

  // Radar's yellow "Updating": the controller has not caught up, or replicas
  // are still being replaced/started.
  const controllerStale = generation !== undefined && observed !== undefined && observed < generation;
  if (controllerStale) return { text: "Updating", tone: "warning", detail: counts };
  if (ready === 0) return { text: "Not ready", tone: "error", detail: counts };
  if (updated < desired || ready < desired || available < desired) {
    return { text: "Updating", tone: "warning", detail: counts };
  }
  return { text: "Running", tone: "success", detail: counts };
}

export function daemonSetStatus(object: AnyObject): ResourceStatus {
  const desired = object.status?.desiredNumberScheduled ?? 0;
  const ready = object.status?.numberReady ?? 0;
  const updated = object.status?.updatedNumberScheduled ?? ready;
  const unavailable = object.status?.numberUnavailable ?? 0;
  const generation = object.metadata?.generation;
  const observed = object.status?.observedGeneration;
  const counts = `${ready}/${desired} ready · ${updated}/${desired} updated`;

  if (desired === 0) return { text: "No nodes", tone: "neutral" };
  const controllerStale = generation !== undefined && observed !== undefined && observed < generation;
  if (controllerStale) return { text: "Updating", tone: "warning", detail: counts };
  if (ready === 0) return { text: "Not ready", tone: "error", detail: counts };
  if (unavailable > 0 || updated < desired || ready < desired) {
    return { text: "Updating", tone: "warning", detail: counts };
  }
  return { text: "Running", tone: "success", detail: counts };
}

export function jobStatus(object: AnyObject): ResourceStatus {
  const failed = object.status?.failed ?? 0;
  const succeeded = object.status?.succeeded ?? 0;
  const active = object.status?.active ?? 0;
  const failedCondition = condition(object, "Failed");
  if (failedCondition?.status === "True") {
    return { text: "Failed", tone: "error", detail: failedCondition.reason };
  }
  if (succeeded > 0) return { text: "Completed", tone: "success" };
  if (active > 0) return { text: "Running", tone: "info" };
  if (failed > 0) return { text: `${failed} failed`, tone: "error" };
  return { text: "Pending", tone: "neutral" };
}

export function cronJobStatus(object: AnyObject): ResourceStatus {
  if (object.spec?.suspend) return { text: "Suspended", tone: "warning" };
  const active = object.status?.active?.length ?? 0;
  if (active > 0) return { text: `${active} active`, tone: "info" };
  return { text: "Ready", tone: "success" };
}

export function nodeStatus(node: AnyObject): ResourceStatus {
  const ready = condition(node, "Ready");
  if (node.spec?.unschedulable) {
    return {
      text: "Scheduling disabled",
      tone: "warning",
      detail: `spec.unschedulable is true — no new pods are scheduled here.${
        ready?.reason ? ` Ready: ${ready.reason}.` : ""
      }`,
    };
  }
  if (ready?.status === "True") return { text: "Ready", tone: "success" };
  if (ready?.status === "False") return { text: "NotReady", tone: "error", detail: ready.reason ?? ready.message };
  return { text: "Unknown", tone: "warning", detail: ready?.reason ?? ready?.message };
}

export function pvcStatus(pvc: AnyObject): ResourceStatus {
  const phase = pvc.status?.phase ?? "Pending";
  if (phase === "Bound") return { text: "Bound", tone: "success" };
  if (phase === "Lost") return { text: "Lost", tone: "error" };
  return { text: phase, tone: "warning" };
}

export function pvStatus(pv: AnyObject): ResourceStatus {
  const phase = pv.status?.phase ?? "Pending";
  if (phase === "Bound" || phase === "Available") return { text: phase, tone: "success" };
  if (phase === "Failed") return { text: phase, tone: "error" };
  return { text: phase, tone: "warning" };
}

export function serviceStatus(service: AnyObject): ResourceStatus {
  // Radar shows the type itself as the status: LoadBalancer/NodePort are the
  // notable ones, ClusterIP the default. Endpoints carry the health signal.
  const type = service.spec?.type ?? "ClusterIP";
  if (type === "LoadBalancer" || type === "NodePort") return { text: type, tone: "violet" };
  if (type === "ExternalName") return { text: "ExternalName", tone: "info" };
  return { text: type, tone: "info" };
}

/** Radar's `getCRDStatus`: termination beats names, names beat establishment. */
export function crdStatus(crd: AnyObject): ResourceStatus {
  const conditions = (crd.status?.conditions ?? []) as Array<Record<string, any>>;
  const isTrue = (type: string) => conditions.find((entry) => entry.type === type)?.status === "True";
  const reasonOf = (type: string) => conditions.find((entry) => entry.type === type)?.reason;
  if (crd.metadata?.deletionTimestamp || isTrue("Terminating")) {
    return { text: "Terminating", tone: "warning" };
  }
  if (conditions.find((entry) => entry.type === "NamesAccepted")?.status === "False") {
    return { text: reasonOf("NamesAccepted") ?? "Names not accepted", tone: "error" };
  }
  const established = conditions.find((entry) => entry.type === "Established");
  if (established?.status === "False") {
    return { text: established.reason ?? "Not established", tone: "error" };
  }
  if (established?.status === "True") return { text: "Established", tone: "success" };
  return { text: "Unknown", tone: "neutral" };
}

export function ingressStatus(ingress: AnyObject): ResourceStatus {
  const lb = ingress.status?.loadBalancer?.ingress ?? [];
  if (lb.length > 0) return { text: "Ready", tone: "success" };
  return { text: "Pending", tone: "warning" };
}

export function hpaStatus(hpa: AnyObject): ResourceStatus {
  const current = hpa.status?.currentReplicas ?? 0;
  const desired = hpa.status?.desiredReplicas ?? 0;
  const able = condition(hpa, "AbleToScale");
  if (able?.status === "False") return { text: "Scaling issue", tone: "error", detail: able.reason };
  if (current < desired) return { text: `Scaling ${current}→${desired}`, tone: "info" };
  return { text: `${current} / ${desired}`, tone: "success" };
}

export function pdbStatus(pdb: AnyObject): ResourceStatus {
  const allowed = pdb.status?.disruptionsAllowed ?? 0;
  if (allowed === 0) return { text: "No disruptions allowed", tone: "warning" };
  return { text: `${allowed} disruptions allowed`, tone: "success" };
}

export function eventStatus(event: AnyObject): ResourceStatus {
  return event.type === "Warning" ? { text: "Warning", tone: "warning" } : { text: "Normal", tone: "info" };
}

/** Generic fallback used for CRDs and kinds without a dedicated mapping. */
export function genericStatus(object: AnyObject): ResourceStatus {
  if (object.metadata?.deletionTimestamp) return { text: "Terminating", tone: "warning" };

  const all = conditions(object);
  // Negative conditions only carry meaning while they are True.
  const negative = all.find(
    (entry) => entry.status === "True" && ["Degraded", "Warning", "ScalingLimited"].includes(entry.type),
  );
  if (negative) return { text: negative.type, tone: "warning", detail: negative.reason };

  const ready = all.find(
    (entry) => entry.type === "Ready" || entry.type === "Available" || entry.type === "Healthy",
  );
  if (ready) {
    if (ready.status === "True") return { text: ready.type, tone: "success" };
    if (ready.status === "False") return { text: ready.reason ?? `Not ${ready.type}`, tone: "error" };
    if (ready.status === "Unknown") return { text: ready.reason ?? ready.type, tone: "neutral" };
  }

  const phase = object.status?.phase;
  if (typeof phase === "string" && phase) {
    const lower = phase.toLowerCase();
    if (
      ["running", "active", "ready", "available", "bound", "succeeded", "healthy", "complete", "completed"].includes(
        lower,
      )
    ) {
      return { text: phase, tone: "success" };
    }
    if (
      ["failed", "error", "unhealthy", "lost", "rejected", "crashloopbackoff", "imagepullbackoff", "errimagepull"].includes(
        lower,
      )
    ) {
      return { text: phase, tone: "error" };
    }
    if (
      ["pending", "warning", "terminating", "suspended", "waiting", "provisioning", "reconciling", "progressing", "unknown"].includes(
        lower,
      )
    ) {
      return { text: phase, tone: "warning" };
    }
    return { text: phase, tone: "info" };
  }

  const replicas = object.status;
  if (replicas && typeof replicas.readyReplicas === "number" && typeof replicas.replicas === "number") {
    const readyCount = replicas.readyReplicas;
    const desired = replicas.replicas;
    const text = `${readyCount}/${desired} Ready`;
    if (desired > 0 && readyCount === desired) return { text, tone: "success" };
    if (readyCount === 0) return { text, tone: "error" };
    return { text, tone: "warning" };
  }

  if (typeof object.status?.ready === "boolean") {
    return object.status.ready
      ? { text: "Ready", tone: "success" }
      : { text: "Not ready", tone: "warning" };
  }

  const state = object.status?.state ?? object.status?.status;
  if (typeof state === "string" && state) return { text: state, tone: "neutral" };

  return { text: "—", tone: "neutral" };
}

export function resourceStatus(object: AnyObject, kind?: string): ResourceStatus {
  // Custom resources reuse built-in kind names (MetalMonk's `Node`), but their
  // status is their own schema: never read it with a built-in mapping.
  if (!usesBuiltinStatus(object)) return genericStatus(object);
  const key = (kind ?? object.kind ?? "").toLowerCase();
  switch (key) {
    case "pod":
    case "pods":
      return podStatus(object);
    case "deployment":
    case "deployments":
    case "statefulset":
    case "statefulsets":
    case "replicaset":
    case "replicasets":
    case "replicationcontroller":
      return workloadStatus(object);
    case "daemonset":
    case "daemonsets":
      return daemonSetStatus(object);
    case "job":
    case "jobs":
      return jobStatus(object);
    case "cronjob":
    case "cronjobs":
      return cronJobStatus(object);
    case "node":
    case "nodes":
      return nodeStatus(object);
    case "persistentvolumeclaim":
    case "persistentvolumeclaims":
      return pvcStatus(object);
    case "persistentvolume":
    case "persistentvolumes":
      return pvStatus(object);
    case "service":
    case "services":
      return serviceStatus(object);
    case "ingress":
    case "ingresses":
      return ingressStatus(object);
    case "horizontalpodautoscaler":
      return hpaStatus(object);
    case "poddisruptionbudget":
      return pdbStatus(object);
    case "event":
    case "events":
      return eventStatus(object);
    case "customresourcedefinition":
    case "customresourcedefinitions":
      return crdStatus(object);
    default:
      return genericStatus(object);
  }
}

export function conditionTone(status?: string): Tone {
  if (status === "True") return "success";
  if (status === "False") return "error";
  return "warning";
}
