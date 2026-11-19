import type { KubeObject } from "@shared/types";
import { stringify } from "yaml";
import { api, call } from "./api";
import { isBuiltinApiVersion } from "./status";

/**
 * Workload actions shared by the Resource Browser row menu and the Details
 * drawer, mirroring Radar's action matrix:
 *
 * - Deployment  — scale, restart rollout, pause/resume rollout, suspend (n/a)
 * - StatefulSet — scale, restart rollout
 * - ReplicaSet  — scale (its pod template belongs to the owning Deployment)
 * - DaemonSet   — restart rollout
 * - Job         — suspend/resume
 * - CronJob     — suspend/resume
 *
 * Every action is a Kubernetes merge patch; no extra IPC channel is needed.
 */

const SCALABLE = new Set(["deployment", "statefulset", "replicaset"]);
const RESTARTABLE = new Set(["deployment", "statefulset", "daemonset"]);
const PAUSABLE = new Set(["deployment"]);
const SUSPENDABLE = new Set(["job", "cronjob"]);
const IMAGE_EDITABLE = new Set(["deployment", "statefulset", "daemonset", "replicaset", "job", "cronjob"]);

export interface WorkloadCapabilities {
  scalable: boolean;
  restartable: boolean;
  pausable: boolean;
  suspendable: boolean;
  imageEditable: boolean;
  triggerable: boolean;
  drainable: boolean;
}

export function workloadCapabilities(kind: string, apiVersion?: string): WorkloadCapabilities {
  // A custom resource can reuse a built-in kind name (`Node`); scaling,
  // restarting or draining it with Kubernetes workload patches would be wrong.
  if (!isBuiltinApiVersion(apiVersion)) {
    return {
      scalable: false,
      restartable: false,
      pausable: false,
      suspendable: false,
      imageEditable: false,
      triggerable: false,
      drainable: false,
    };
  }
  const lower = kind.toLowerCase();
  return {
    scalable: SCALABLE.has(lower),
    restartable: RESTARTABLE.has(lower),
    pausable: PAUSABLE.has(lower) && (!apiVersion || apiVersion.startsWith("apps/")),
    suspendable: SUSPENDABLE.has(lower),
    imageEditable: IMAGE_EDITABLE.has(lower),
    triggerable: lower === "cronjob",
    drainable: lower === "node",
  };
}

export function isDeploymentPaused(object: KubeObject | undefined | null): boolean {
  return object?.spec?.paused === true;
}

export function isSuspended(object: KubeObject | undefined | null): boolean {
  return object?.spec?.suspend === true;
}

interface Target {
  clusterId: string;
  apiVersion: string;
  kind: string;
  namespace?: string;
  name: string;
}

export async function scaleWorkload(target: Target, replicas: number): Promise<void> {
  await call(
    api.resources.scale({
      clusterId: target.clusterId,
      apiVersion: target.apiVersion,
      kind: target.kind,
      namespace: target.namespace ?? "",
      name: target.name,
      replicas,
    }),
  );
}

export async function restartWorkload(target: Target): Promise<void> {
  await call(
    api.resources.restart({
      clusterId: target.clusterId,
      apiVersion: target.apiVersion,
      kind: target.kind,
      namespace: target.namespace ?? "",
      name: target.name,
    }),
  );
}

export async function setWorkloadPaused(target: Target, paused: boolean): Promise<void> {
  await call(
    api.resources.patch({
      clusterId: target.clusterId,
      apiVersion: target.apiVersion,
      kind: target.kind,
      namespace: target.namespace,
      name: target.name,
      patch: { spec: { paused } },
    }),
  );
}

export async function setWorkloadSuspended(target: Target, suspend: boolean): Promise<void> {
  await call(
    api.resources.patch({
      clusterId: target.clusterId,
      apiVersion: target.apiVersion,
      kind: target.kind,
      namespace: target.namespace,
      name: target.name,
      patch: { spec: { suspend } },
    }),
  );
}

export interface ReplicaScaler {
  kind: string;
  name: string;
}

/**
 * `kubectl create job --from=cronjob/x` equivalent: instantiate the
 * jobTemplate as a one-off Job without touching the CronJob schedule.
 */
export async function triggerCronJob(clusterId: string, object: KubeObject): Promise<string> {
  const jobTemplate = (object.spec?.jobTemplate as Record<string, unknown> | undefined) ?? {};
  const namespace = object.metadata?.namespace;
  if (!namespace) throw new Error("CronJob has no namespace");
  const base = `${object.metadata?.name ?? "cronjob"}-manual-${Date.now().toString(36)}`;
  const name = base.slice(0, 63).replace(/[^a-z0-9-]/g, "-");
  const job = {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: {
      name,
      namespace,
      labels: { ...(object.metadata?.labels ?? {}), "cronjob.kubernetes.io/instantiate": "manual" },
      annotations: { "cronjob.kubernetes.io/instantiate": "manual" },
    },
    spec: (jobTemplate.spec as Record<string, unknown> | undefined) ?? {},
  };
  await call(api.resources.apply({ clusterId, yaml: stringify(job), dryRun: false, createOnly: true }));
  return name;
}

/**
 * Radar blocks manual scaling when an HPA owns the replica count. We resolve
 * that lazily (only when the user actually presses Scale) so the details drawer
 * does not add a list request for every resource it opens.
 */
export async function findReplicaScaler(
  clusterId: string,
  namespace: string | undefined,
  kind: string,
  name: string,
): Promise<ReplicaScaler | null> {
  if (!namespace) return null;
  for (const apiVersion of ["autoscaling/v2", "autoscaling/v1"]) {
    try {
      const result = await call(
        api.resources.list({
          clusterId,
          apiVersion,
          kind: "HorizontalPodAutoscaler",
          namespace,
          limit: 200,
        }),
      );
      const match = result.items.find((hpa) => {
        const ref = hpa.spec?.scaleTargetRef as { kind?: string; name?: string } | undefined;
        return (
          ref?.kind?.toLowerCase() === kind.toLowerCase() &&
          ref?.name === name
        );
      });
      return match ? { kind: "HorizontalPodAutoscaler", name: match.metadata?.name ?? "" } : null;
    } catch {
      // Autoscaling API unavailable or forbidden for this user: try the older
      // version, then allow scaling and let the API server answer.
    }
  }
  return null;
}
