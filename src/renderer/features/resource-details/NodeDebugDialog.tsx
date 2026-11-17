import { useEffect, useRef, useState } from "react";
import { Terminal } from "lucide-react";
import { Modal } from "../../design-system/components/Modal";
import { Button } from "../../design-system/components/Button";
import { YamlEditor } from "../../design-system/components/YamlEditor";
import { api, call, errorText } from "../../lib/api";
import { toast } from "../../design-system/components/Toast";
import { useSessionStore } from "../../stores/session-store";

const POLL_MS = 1_000;
const DEADLINE_MS = 90_000;

/** DNS-1123-ish sanitising of a node name for use inside a pod name/label. */
function sanitize(value: string, max: number): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

/**
 * The manifest Radar's node debug pod uses, adapted to mLens: a privileged
 * pod pinned to the node with host PID/network/IPC and the host root mounted
 * at /host. It is shown as editable YAML before anything is created, so the
 * image, namespace, command or security context can be reassigned first.
 */
function initialYaml(nodeName: string): string {
  const slug = sanitize(nodeName, 40) || "node";
  const label = sanitize(nodeName, 63) || "node";
  const name = `mlens-node-debug-${slug}-${Math.floor(Date.now() / 1000)}`;
  return [
    "apiVersion: v1",
    "kind: Pod",
    "metadata:",
    `  name: ${name}`,
    "  namespace: default",
    "  labels:",
    "    app.kubernetes.io/managed-by: mlens",
    `    mlens.io/debug-node: ${label}`,
    "spec:",
    `  nodeName: ${nodeName}`,
    "  hostPID: true",
    "  hostNetwork: true",
    "  hostIPC: true",
    "  restartPolicy: Never",
    "  activeDeadlineSeconds: 3600",
    "  containers:",
    "    - name: debug",
    "      image: busybox:latest",
    '      command: ["sleep", "infinity"]',
    "      stdin: true",
    "      tty: true",
    "      securityContext:",
    "        privileged: true",
    "      volumeMounts:",
    "        - name: host-root",
    "          mountPath: /host",
    "  volumes:",
    "    - name: host-root",
    "      hostPath:",
    "        path: /",
    "  tolerations:",
    "    - operator: Exists",
    "",
  ].join("\n");
}

type Phase = "edit" | "waiting";

export function NodeDebugDialog({
  open,
  onClose,
  clusterId,
  nodeName,
}: {
  open: boolean;
  onClose: () => void;
  clusterId: string;
  nodeName: string;
}) {
  const [yaml, setYaml] = useState(() => initialYaml(nodeName));
  const [phase, setPhase] = useState<Phase>("edit");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const openTerminal = useSessionStore((state) => state.openTerminal);
  const abortRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    abortRef.current = false;
    setYaml(initialYaml(nodeName));
    setPhase("edit");
    setStatus("");
    setBusy(false);
    return () => {
      abortRef.current = true;
    };
  }, [open, nodeName]);

  const apply = async (dryRun: boolean) => {
    setBusy(true);
    try {
      const results = await call(api.resources.apply({ clusterId, yaml, dryRun }));
      const pod = results.find((entry) => entry.kind === "Pod") ?? results[0];
      if (!pod) throw new Error("The manifest did not create a Pod.");
      if (dryRun) {
        toast.success("YAML is valid", "Server-side dry run succeeded.");
        return;
      }

      const namespace = pod.namespace ?? "default";
      const name = pod.name;
      setPhase("waiting");
      setStatus(`Created ${namespace}/${name} — waiting for the pod to run…`);

      const deadline = Date.now() + DEADLINE_MS;
      let phaseText = "";
      while (Date.now() < deadline) {
        if (abortRef.current) return;
        const current = await call(
          api.resources.get({ clusterId, apiVersion: "v1", kind: "Pod", namespace, name }),
        );
        const podStatus = (current.status ?? {}) as Record<string, any>;
        const podPhase = String(podStatus.phase ?? "Pending");
        const waiting =
          podStatus.containerStatuses?.[0]?.state?.waiting?.reason ??
          podStatus.initContainerStatuses?.[0]?.state?.waiting?.reason;
        const nextStatus =
          podPhase === "Running"
            ? "Pod is Running — opening the console…"
            : `Pod is ${podPhase}${waiting ? ` · ${waiting}` : ""}…`;
        if (nextStatus !== phaseText) {
          phaseText = nextStatus;
          setStatus(nextStatus);
        }
        if (podPhase === "Running") {
          const containers = await call(api.pods.containers(clusterId, namespace, name));
          const container =
            containers.find((entry) => entry.name === "debug")?.name ?? containers[0]?.name;
          if (!container) throw new Error("The debug pod has no containers.");
          if (abortRef.current) return;
          openTerminal(clusterId, {
            type: "pod",
            clusterId,
            namespace,
            pod: name,
            container,
            shell: "/bin/sh",
            // The pod was created by this dialog: closing the tab deletes it.
            managedPod: true,
          });
          toast.success("Debug console attached", `${namespace}/${name} on ${nodeName}`);
          setPhase("edit");
          setStatus("");
          onClose();
          return;
        }
        if (podPhase === "Failed" || podPhase === "Succeeded") {
          throw new Error(`The debug pod entered ${podPhase} phase.`);
        }
        await new Promise((resolve) => window.setTimeout(resolve, POLL_MS));
      }
      throw new Error("Timed out waiting for the debug pod to reach Running.");
    } catch (error) {
      if (abortRef.current) return;
      toast.error("Debug shell failed", errorText(error));
      setPhase("edit");
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  const running = phase !== "edit";

  return (
    <Modal
      open={open}
      onClose={running ? () => undefined : onClose}
      width={860}
      title={`Debug shell · ${nodeName}`}
      subtitle="Privileged pod pinned to this node; edit the YAML before applying. The host root is mounted at /host."
      footer={
        <>
          <Button variant="ghost" onClick={() => void apply(true)} disabled={busy || running}>
            Dry run
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void apply(false)} disabled={busy || running}>
            {busy ? "Starting…" : "Apply & open console"}
          </Button>
        </>
      }
    >
      <div className="h-[46vh] overflow-hidden rounded-lg border border-theme-border">
        <YamlEditor value={yaml} onChange={setYaml} readOnly={running} />
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px]">
        {running ? (
          <>
            <span className="h-2 w-2 animate-pulse rounded-full bg-skyhook-500" />
            <span className="text-theme-text-secondary">{status}</span>
          </>
        ) : (
          <span className="text-theme-text-tertiary">
            <Terminal className="mr-1 inline h-3 w-3" />
            After apply the pod is waited out and an exec console opens in the bottom dock; closing that tab
            deletes the pod.
          </span>
        )}
      </div>
    </Modal>
  );
}
