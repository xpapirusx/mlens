import { useEffect, useState } from "react";
import type { PodContainerInfo } from "@shared/types";
import { SquareTerminal } from "lucide-react";
import { Modal } from "../../design-system/components/Modal";
import { Button } from "../../design-system/components/Button";
import { Spinner } from "../../design-system/components/Spinner";
import { api, call, errorText } from "../../lib/api";
import { DEFAULT_POD_COMMAND } from "../../lib/command-line";
import { useSessionStore } from "../../stores/session-store";
import { toast } from "../../design-system/components/Toast";

const SHELLS = ["/bin/sh", "/bin/bash", "/bin/ash", "/bin/zsh", "/bin/fish", "sh", "bash", "powershell", "cmd"];

/**
 * Exec is a dialog rather than an immediate terminal: the first container is a
 * default, and the command is pre-filled with the bash → ash → sh chain — the
 * user may pick another container or command (busybox images, bash-only images,
 * Windows pods, …) before opening the dock. The command field takes arguments
 * (`sh -c "…"`), just like `kubectl exec`.
 */
export function ExecDialog({
  open,
  onClose,
  clusterId,
  namespace,
  pod,
}: {
  open: boolean;
  onClose: () => void;
  clusterId: string;
  namespace: string;
  pod: string;
}) {
  const openTerminal = useSessionStore((state) => state.openTerminal);
  const [containers, setContainers] = useState<PodContainerInfo[]>([]);
  const [container, setContainer] = useState("");
  const [shell, setShell] = useState(DEFAULT_POD_COMMAND);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let disposed = false;
    setLoading(true);
    setError(null);
    setContainers([]);
    setContainer("");
    setShell(DEFAULT_POD_COMMAND);
    call(api.pods.containers(clusterId, namespace, pod))
      .then((list) => {
        if (disposed) return;
        setContainers(list);
        setContainer(list[0]?.name ?? "");
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
  }, [open, clusterId, namespace, pod]);

  const start = () => {
    if (!container) {
      toast.error("Choose a container");
      return;
    }
    openTerminal(clusterId, {
      type: "pod",
      clusterId,
      namespace,
      pod,
      container,
      // The field may carry arguments (`sh -c "…"`); argv is parsed when the
      // terminal starts so a pasted kubectl-style command works.
      shell: shell.trim() || DEFAULT_POD_COMMAND,
    });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={480}
      title="Exec into pod"
      subtitle={`${namespace}/${pod}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={loading || Boolean(error) || !container} onClick={start}>
            <SquareTerminal className="h-3.5 w-3.5" />
            Open terminal
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="flex h-24 items-center justify-center">
          <Spinner label="Reading containers…" />
        </div>
      ) : error ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-[calc(11px*var(--font-scale))] text-red-600 dark:text-red-400">
          {error}
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block text-[calc(11px*var(--font-scale))] font-medium text-theme-text-secondary">
            Container
            <select
              value={container}
              onChange={(event) => setContainer(event.target.value)}
              className="mt-1 h-8 w-full rounded-md border border-theme-border bg-theme-elevated px-2 font-mono text-xs text-theme-text-primary focus:outline-none focus:ring-2 focus:ring-skyhook-500/60"
            >
              {containers.length === 0 ? <option value="">No containers</option> : null}
              {containers.map((entry) => (
                <option key={entry.name} value={entry.name}>
                  {entry.name}
                  {entry.image ? ` — ${entry.image}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[calc(11px*var(--font-scale))] font-medium text-theme-text-secondary">
            Command
            <input
              value={shell}
              list="mlens-exec-shells"
              onChange={(event) => setShell(event.target.value)}
              spellCheck={false}
              className="mt-1 h-8 w-full rounded-md border border-theme-border bg-theme-elevated px-2 font-mono text-sm text-theme-text-primary focus:outline-none focus:ring-2 focus:ring-skyhook-500/60"
              placeholder={DEFAULT_POD_COMMAND}
            />
            <datalist id="mlens-exec-shells">
              {SHELLS.map((entry) => (
                <option key={entry} value={entry} />
              ))}
            </datalist>
            <span className="mt-1 block text-[calc(10px*var(--font-scale))] font-normal text-theme-text-tertiary">
              Arguments are supported, e.g. sh -c "clear; (bash || ash || sh)" or powershell for Windows pods.
            </span>
          </label>
          <p className="text-[calc(10px*var(--font-scale))] leading-relaxed text-theme-text-tertiary">
            The command runs through the Kubernetes exec WebSocket in the bottom dock — no kubectl,
            no local binary.
          </p>
        </div>
      )}
    </Modal>
  );
}
