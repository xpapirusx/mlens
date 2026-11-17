import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Boxes, CheckCircle2, Loader2, Server } from "lucide-react";
import type { KubeObject } from "@shared/types";
import { api, call, errorText } from "../../lib/api";
import { Modal } from "../../design-system/components/Modal";
import { Button } from "../../design-system/components/Button";
import { toast } from "../../design-system/components/Toast";
import { cn } from "../../lib/cn";

interface DrainPod {
  object: KubeObject;
  name: string;
  namespace: string;
  owner?: string;
  daemonSet: boolean;
  mirror: boolean;
  localData: boolean;
  unmanaged: boolean;
  evictable: boolean;
  reason?: string;
}

function hasLocalData(pod: KubeObject): boolean {
  const volumes = (pod.spec?.volumes ?? []) as Array<Record<string, unknown>>;
  return volumes.some((volume) => Boolean(volume.emptyDir || volume.hostPath));
}

function classify(pod: KubeObject, force: boolean, deleteEmptyDirData: boolean): DrainPod {
  const owners = (pod.metadata?.ownerReferences ?? []) as Array<{ kind: string; name: string }>;
  const daemonSet = owners.some((owner) => owner.kind === "DaemonSet");
  const mirror = Boolean(pod.metadata?.annotations?.["kubernetes.io/config.mirror"]);
  const localData = hasLocalData(pod);
  const unmanaged = owners.length === 0;
  let reason: string | undefined;
  if (daemonSet) reason = "DaemonSet pod (stays by design)";
  else if (mirror) reason = "static/mirror pod";
  else if (unmanaged && !force) reason = "no controller — enable Force";
  else if (localData && !deleteEmptyDirData) reason = "uses emptyDir/hostPath — enable local data deletion";
  return {
    object: pod,
    name: pod.metadata?.name ?? "",
    namespace: pod.metadata?.namespace ?? "",
    owner: owners[0] ? `${owners[0].kind}/${owners[0].name}` : undefined,
    daemonSet,
    mirror,
    localData,
    unmanaged,
    evictable: !reason,
    reason,
  };
}

export function NodeDrainDialog({
  open,
  onClose,
  clusterId,
  node,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  clusterId: string;
  node: string;
  onDone?: () => void;
}) {
  const [pods, setPods] = useState<KubeObject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [force, setForce] = useState(false);
  const [deleteEmptyDirData, setDeleteEmptyDirData] = useState(false);
  const [cordon, setCordon] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let disposed = false;
    setLoading(true);
    setError(null);
    void call(
      api.resources.list({
        clusterId,
        apiVersion: "v1",
        kind: "Pod",
        fieldSelector: `spec.nodeName=${node}`,
        limit: 1000,
      }),
    )
      .then((result) => {
        if (!disposed) setPods(result.items);
      })
      .catch((loadError) => {
        if (!disposed) setError(errorText(loadError));
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [open, clusterId, node]);

  const plan = useMemo(
    () => pods.map((pod) => classify(pod, force, deleteEmptyDirData)),
    [pods, force, deleteEmptyDirData],
  );
  const evictable = plan.filter((entry) => entry.evictable);
  const blocked = plan.filter((entry) => !entry.evictable);
  const daemonSetCount = plan.filter((entry) => entry.daemonSet).length;
  const mirrorCount = plan.filter((entry) => entry.mirror).length;

  const drain = async () => {
    setBusy(true);
    const failures: string[] = [];
    try {
      if (cordon) {
        await call(
          api.resources.patch({
            clusterId,
            apiVersion: "v1",
            kind: "Node",
            name: node,
            patch: { spec: { unschedulable: true } },
          }),
        );
      }
      for (const entry of evictable) {
        try {
          await call(
            api.resources.evict({
              clusterId,
              namespace: entry.namespace,
              name: entry.name,
              gracePeriodSeconds: 30,
            }),
          );
        } catch (evictError) {
          failures.push(`${entry.namespace}/${entry.name}: ${errorText(evictError)}`);
        }
      }
      if (failures.length === 0) {
        toast.success(`${node} drained`, `${evictable.length} pod${evictable.length === 1 ? "" : "s"} evicted${cordon ? ", node cordoned" : ""}.`);
      } else {
        toast.error(`Drain finished with ${failures.length} failure${failures.length === 1 ? "" : "s"}`, failures.slice(0, 4).join("\n"));
      }
      if (cordon) toast.success("Node cordoned", node);
      onDone?.();
      onClose();
    } catch (drainError) {
      toast.error("Drain failed", errorText(drainError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={680}
      title={`Drain node ${node}`}
      subtitle="Evict pods through the policy/v1 Eviction API; DaemonSet and mirror pods are kept."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => void drain()}
            disabled={busy || loading || Boolean(error) || (evictable.length === 0 && !cordon)}
          >
            {busy ? "Draining…" : `Drain ${evictable.length} pod${evictable.length === 1 ? "" : "s"}`}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-4 text-[11px] text-theme-text-secondary">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={cordon}
              onChange={(event) => setCordon(event.target.checked)}
              className="h-3.5 w-3.5 rounded border-theme-border accent-skyhook-500"
            />
            Cordon node first
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={force}
              onChange={(event) => setForce(event.target.checked)}
              className="h-3.5 w-3.5 rounded border-theme-border accent-skyhook-500"
            />
            Force (evict pods without a controller)
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={deleteEmptyDirData}
              onChange={(event) => setDeleteEmptyDirData(event.target.checked)}
              className="h-3.5 w-3.5 rounded border-theme-border accent-skyhook-500"
            />
            Delete emptyDir/hostPath data
          </label>
        </div>

        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-theme-text-tertiary" />
          </div>
        ) : error ? (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-500">{error}</div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-2">
              <div className="card-inner">
                <div className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-theme-text-tertiary">
                  <Boxes className="h-3 w-3" /> Pods
                </div>
                <div className="mt-1 font-mono text-[18px] font-semibold text-theme-text-primary">{plan.length}</div>
              </div>
              <div className="card-inner">
                <div className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-theme-text-tertiary">
                  <CheckCircle2 className="h-3 w-3" /> Evictable
                </div>
                <div className="mt-1 font-mono text-[18px] font-semibold text-emerald-500">{evictable.length}</div>
              </div>
              <div className="card-inner">
                <div className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-theme-text-tertiary">
                  <Server className="h-3 w-3" /> DaemonSet
                </div>
                <div className="mt-1 font-mono text-[18px] font-semibold text-theme-text-secondary">{daemonSetCount}</div>
              </div>
              <div className="card-inner">
                <div className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-theme-text-tertiary">
                  <AlertTriangle className="h-3 w-3" /> Blocked
                </div>
                <div className="mt-1 font-mono text-[18px] font-semibold text-amber-500">{blocked.length}</div>
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto rounded-md border border-theme-border">
              {plan.length === 0 ? (
                <div className="px-3 py-4 text-[11px] text-theme-text-tertiary">No pods on this node.</div>
              ) : (
                plan.map((entry) => (
                  <div
                    key={`${entry.namespace}/${entry.name}`}
                    className={cn(
                      "flex items-center gap-2 border-b border-theme-border-subtle px-2.5 py-1.5 text-[11px] last:border-0",
                      !entry.evictable && "opacity-70",
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        entry.evictable ? "bg-emerald-500" : "bg-amber-500",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate font-mono text-theme-text-primary">{entry.name}</span>
                    <span className="w-24 shrink-0 truncate text-[10px] text-theme-text-tertiary">{entry.namespace}</span>
                    <span className="w-40 shrink-0 truncate text-[10px] text-theme-text-disabled">
                      {entry.owner ?? "unmanaged"}
                    </span>
                    <span className="w-56 shrink-0 truncate text-[10px] text-amber-600 dark:text-amber-400">
                      {entry.reason ?? "evict"}
                    </span>
                  </div>
                ))
              )}
            </div>
            {mirrorCount > 0 ? (
              <div className="text-[10px] text-theme-text-disabled">{mirrorCount} mirror pod(s) are ignored.</div>
            ) : null}
            <div className="text-[10px] text-theme-text-disabled">
              The plan is read live from the API. Eviction honours PodDisruptionBudgets; blocked evictions are reported
              after the drain.
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
