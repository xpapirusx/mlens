import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Monitor, SquareTerminal } from "lucide-react";
import type { PodContainerInfo } from "@shared/types";
import type { TerminalTarget } from "../../stores/session-store";
import { useChromeSessions, useSessionStore } from "../../stores/session-store";
import { useCatalogStore } from "../../stores/catalog-store";
import { api, call, errorText } from "../../lib/api";
import { Modal } from "../../design-system/components/Modal";
import { Button } from "../../design-system/components/Button";
import { cn } from "../../lib/cn";

export type TerminalMode = "local" | "pod";

const SHELLS = ["/bin/sh", "/bin/bash", "/bin/ash", "/bin/zsh"];

export function TerminalLauncher({
  open,
  initialMode,
  onClose,
  clusterId,
  onLaunch,
}: {
  open: boolean;
  initialMode: TerminalMode;
  onClose: () => void;
  clusterId: string;
  onLaunch: (target: TerminalTarget) => void;
}) {
  const sessions = useChromeSessions();
  const clusters = useCatalogStore((state) => state.clusters);
  const allClusters = useCatalogStore((state) => state.allClusters);
  const health = useCatalogStore((state) => state.health);

  const [mode, setMode] = useState<TerminalMode>(initialMode);
  const [targetCluster, setTargetCluster] = useState(clusterId);
  const [namespace, setNamespace] = useState("");
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [pod, setPod] = useState("");
  const [container, setContainer] = useState("");
  const [shell, setShell] = useState("/bin/sh");
  const [pods, setPods] = useState<string[]>([]);
  const [containers, setContainers] = useState<PodContainerInfo[]>([]);
  const [loadingNamespaces, setLoadingNamespaces] = useState(false);
  const [loadingPods, setLoadingPods] = useState(false);
  const [loadingContainers, setLoadingContainers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const namespaceRequest = useRef(0);

  const connected = useMemo(
    () =>
      clusters.filter(
        (cluster) =>
          health[cluster.id]?.status === "connected" || sessions[cluster.id]?.status === "connected",
      ),
    [clusters, health, sessions],
  );

  const clusterName = allClusters.find((cluster) => cluster.id === targetCluster)?.name ?? "cluster";

  const applyCluster = (id: string) => {
    setTargetCluster(id);
    setPod("");
    setContainer("");
    setPods([]);
    setContainers([]);
    setError(null);

    const session = useSessionStore.getState().sessions[id];
    setNamespace(session?.selectedNamespaces.length === 1 ? session.selectedNamespaces[0] : "");

    const token = ++namespaceRequest.current;
    if (session?.namespaces.length) {
      setNamespaces(session.namespaces);
      setLoadingNamespaces(false);
      return;
    }
    setNamespaces([]);
    setLoadingNamespaces(true);
    call(api.clusters.namespaces(id))
      .then((list) => {
        if (token !== namespaceRequest.current) return;
        setNamespaces(list.map((entry) => entry.name).sort((a, b) => a.localeCompare(b)));
      })
      .catch((cause) => {
        if (token === namespaceRequest.current) setError(errorText(cause));
      })
      .finally(() => {
        if (token === namespaceRequest.current) setLoadingNamespaces(false);
      });
  };

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setShell("/bin/sh");
    setPods([]);
    setContainers([]);
    setLoadingPods(false);
    setLoadingContainers(false);
    applyCluster(clusterId);
    // Reset only when the dialog is opened, not on every session update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialMode, clusterId]);

  useEffect(() => {
    if (!open || mode !== "pod" || !namespace) {
      setPods([]);
      return;
    }
    let cancelled = false;
    setLoadingPods(true);
    setError(null);
    call(
      api.resources.list({
        clusterId: targetCluster,
        apiVersion: "v1",
        kind: "Pod",
        namespace,
        limit: 1000,
      }),
    )
      .then((result) => {
        if (cancelled) return;
        setPods(result.items.map((item) => item.metadata.name).sort((a, b) => a.localeCompare(b)));
      })
      .catch((cause) => {
        if (!cancelled) setError(errorText(cause));
      })
      .finally(() => {
        if (!cancelled) setLoadingPods(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, mode, targetCluster, namespace]);

  useEffect(() => {
    if (pods.length === 0) {
      setPod("");
      return;
    }
    setPod((current) => (pods.includes(current) ? current : pods[0]));
  }, [pods]);

  useEffect(() => {
    if (!open || mode !== "pod" || !pod || !namespace) {
      setContainers([]);
      return;
    }
    let cancelled = false;
    setLoadingContainers(true);
    call(api.pods.containers(targetCluster, namespace, pod))
      .then((list) => {
        if (cancelled) return;
        setContainers(list);
        setContainer((current) =>
          list.some((entry) => entry.name === current) ? current : (list[0]?.name ?? ""),
        );
      })
      .catch((cause) => {
        if (!cancelled) {
          setContainers([]);
          setError(errorText(cause));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingContainers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, mode, targetCluster, namespace, pod]);

  const canLaunch =
    Boolean(targetCluster) &&
    (mode === "local" || Boolean(namespace && pod && container));

  const launch = () => {
    if (!canLaunch) return;
    if (mode === "local") {
      onLaunch({
        type: "local",
        clusterId: targetCluster,
        namespace,
      });
    } else {
      onLaunch({
        type: "pod",
        clusterId: targetCluster,
        namespace,
        pod,
        container,
        shell: shell.trim() || "/bin/sh",
      });
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={560}
      title="New terminal session"
      subtitle="Choose the cluster context and namespace for this session."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={launch} disabled={!canLaunch}>
            <SquareTerminal className="h-3.5 w-3.5" />
            {mode === "local" ? "Open shell" : "Attach shell"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-theme-border bg-theme-base p-1">
          {(
            [
              { key: "local" as const, label: "Local shell", icon: Monitor },
              { key: "pod" as const, label: "Pod exec", icon: SquareTerminal },
            ] satisfies Array<{ key: TerminalMode; label: string; icon: typeof Monitor }>
          ).map((entry) => {
            const Icon = entry.icon;
            return (
              <button
                key={entry.key}
                type="button"
                onClick={() => setMode(entry.key)}
                className={cn(
                  "flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors",
                  mode === entry.key
                    ? "bg-theme-elevated text-theme-text-primary shadow-theme-sm"
                    : "text-theme-text-tertiary hover:text-theme-text-secondary",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {entry.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-[calc(10px*var(--font-scale))] font-semibold uppercase tracking-wide text-theme-text-tertiary">
              Cluster context
            </span>
            <select
              value={targetCluster}
              onChange={(event) => applyCluster(event.target.value)}
              className="h-8 w-full rounded-md border border-theme-border bg-theme-base px-2 text-xs text-theme-text-primary focus:outline-none"
            >
              {connected.some((cluster) => cluster.id === targetCluster) ? null : (
                <option value={targetCluster}>{clusterName}</option>
              )}
              {connected.map((cluster) => (
                <option key={cluster.id} value={cluster.id}>
                  {cluster.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 flex items-center gap-1 text-[calc(10px*var(--font-scale))] font-semibold uppercase tracking-wide text-theme-text-tertiary">
              Namespace {mode === "pod" ? "" : "(optional)"}
              {loadingNamespaces ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : null}
            </span>
            <select
              value={namespace}
              onChange={(event) => {
                setNamespace(event.target.value);
                setPod("");
                setContainer("");
              }}
              className="h-8 w-full rounded-md border border-theme-border bg-theme-base px-2 text-xs text-theme-text-primary focus:outline-none"
            >
              <option value="">Context default</option>
              {namespaces.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </label>
        </div>

        {mode === "pod" ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 flex items-center gap-1 text-[calc(10px*var(--font-scale))] font-semibold uppercase tracking-wide text-theme-text-tertiary">
                  Pod
                  {loadingPods ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : null}
                </span>
                <select
                  value={pod}
                  onChange={(event) => setPod(event.target.value)}
                  disabled={!namespace || loadingPods || pods.length === 0}
                  className="h-8 w-full rounded-md border border-theme-border bg-theme-base px-2 font-mono text-[calc(11px*var(--font-scale))] text-theme-text-primary focus:outline-none disabled:opacity-50"
                >
                  {pods.length === 0 ? <option value="">{namespace ? "No pods" : "Select a namespace"}</option> : null}
                  {pods.map((entry) => (
                    <option key={entry} value={entry}>
                      {entry}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 flex items-center gap-1 text-[calc(10px*var(--font-scale))] font-semibold uppercase tracking-wide text-theme-text-tertiary">
                  Container
                  {loadingContainers ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : null}
                </span>
                <select
                  value={container}
                  onChange={(event) => setContainer(event.target.value)}
                  disabled={loadingContainers || containers.length === 0}
                  className="h-8 w-full rounded-md border border-theme-border bg-theme-base px-2 font-mono text-[calc(11px*var(--font-scale))] text-theme-text-primary focus:outline-none disabled:opacity-50"
                >
                  {containers.length === 0 ? <option value="">No containers</option> : null}
                  {containers.map((entry) => (
                    <option key={entry.name} value={entry.name}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-[calc(10px*var(--font-scale))] font-semibold uppercase tracking-wide text-theme-text-tertiary">
                Shell command
              </span>
              <input
                value={shell}
                onChange={(event) => setShell(event.target.value)}
                list="mlens-terminal-shells"
                spellCheck={false}
                className="h-8 w-full rounded-md border border-theme-border bg-theme-base px-2 font-mono text-[calc(11px*var(--font-scale))] text-theme-text-primary focus:outline-none focus:border-skyhook-500"
              />
              <datalist id="mlens-terminal-shells">
                {SHELLS.map((entry) => (
                  <option key={entry} value={entry} />
                ))}
              </datalist>
            </label>
          </>
        ) : null}

        {error ? (
          <div className="rounded-md border border-red-500/25 bg-red-500/5 px-2 py-1.5 text-[calc(11px*var(--font-scale))] text-red-600 dark:text-red-400">
            {error}
          </div>
        ) : null}

        <p className="text-[calc(10px*var(--font-scale))] leading-relaxed text-theme-text-disabled">
          {mode === "local"
            ? "The shell receives a generated, context-pinned kubeconfig. Your own kubeconfig files are never modified."
            : "The shell runs through the Kubernetes exec WebSocket — no kubectl, no local binary."}
        </p>
      </div>
    </Modal>
  );
}
