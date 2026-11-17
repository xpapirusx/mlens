import type { KubeObject } from "@shared/types";
import { api, call } from "./api";

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

export interface WorkloadCapabilities {
  scalable: boolean;
  restartable: boolean;
  pausable: boolean;
  suspendable: boolean;
}

export function workloadCapabilities(kind: string, apiVersion?: string): WorkloadCapabilities {
  const lower = kind.toLowerCase();
  return {
    scalable: SCALABLE.has(lower),
    restartable: RESTARTABLE.has(lower),
    pausable: PAUSABLE.has(lower) && (!apiVersion || apiVersion.startsWith("apps/")),
    suspendable: SUSPENDABLE.has(lower),
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
