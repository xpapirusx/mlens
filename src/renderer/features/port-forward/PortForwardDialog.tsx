import { useEffect, useState } from "react";
import type { PortForwardInfo } from "@shared/types";
import { Plug, Trash2, ExternalLink } from "lucide-react";
import { Modal } from "../../design-system/components/Modal";
import { Button } from "../../design-system/components/Button";
import { EmptyState } from "../../design-system/components/EmptyState";
import { Spinner } from "../../design-system/components/Spinner";
import { formatRelativeTime } from "../../lib/format";
import { api, call, errorText } from "../../lib/api";
import { toast } from "../../design-system/components/Toast";

export function StartPortForwardDialog({
  open,
  onClose,
  clusterId,
  namespace,
  pod,
  defaultRemotePort,
  onStarted,
}: {
  open: boolean;
  onClose: () => void;
  clusterId: string;
  namespace: string;
  pod: string;
  defaultRemotePort?: number;
  onStarted?: () => void;
}) {
  const [remotePort, setRemotePort] = useState(String(defaultRemotePort ?? 8080));
  const randomPort = () => String(30000 + Math.floor(Math.random() * (65355 - 30000 + 1)));
  const [localPort, setLocalPort] = useState(randomPort);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRemotePort(String(defaultRemotePort ?? 8080));
    setLocalPort(randomPort());
  }, [open, defaultRemotePort]);

  const start = async () => {
    const remote = Number(remotePort);
    const local = Number(localPort);
    if (!Number.isInteger(remote) || remote <= 0 || remote > 65535) {
      toast.error("Invalid remote port");
      return;
    }
    if (!Number.isInteger(local) || local < 0 || local > 65535) {
      toast.error("Invalid local port");
      return;
    }
    setBusy(true);
    try {
      const info = await call(
        api.portForward.start({
          clusterId,
          namespace,
          pod,
          remotePort: remote,
          localPort: local || undefined,
        }),
      );
      toast.success("Port forward started", `http://127.0.0.1:${info.localPort} → ${pod}:${remote}`);
      onStarted?.();
      onClose();
    } catch (error) {
      toast.error("Cannot start port forward", errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={460}
      title="Port forward"
      subtitle={`${namespace}/${pod}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void start()}>
            {busy ? "Starting…" : "Start forwarding"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="text-[11px] font-medium text-theme-text-secondary">
          Local port
          <input
            type="number"
            min={0}
            max={65535}
            value={localPort}
            onChange={(event) => setLocalPort(event.target.value)}
            className="mt-1 h-8 w-full rounded-md border border-theme-border bg-theme-elevated px-2 font-mono text-sm text-theme-text-primary focus:outline-none focus:ring-2 focus:ring-skyhook-500/60"
          />
          <span className="mt-1 block text-[10px] font-normal text-theme-text-tertiary">0 picks a random port 30000–65355</span>
        </label>
        <label className="text-[11px] font-medium text-theme-text-secondary">
          Pod port
          <input
            type="number"
            min={1}
            max={65535}
            value={remotePort}
            onChange={(event) => setRemotePort(event.target.value)}
            className="mt-1 h-8 w-full rounded-md border border-theme-border bg-theme-elevated px-2 font-mono text-sm text-theme-text-primary focus:outline-none focus:ring-2 focus:ring-skyhook-500/60"
          />
        </label>
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-theme-text-tertiary">
        mLens opens a loopback listener on 127.0.0.1 and tunnels it through the Kubernetes
        port-forward WebSocket. No kubectl process is started. The forward stays active until you stop it
        in the Port forwards panel.
      </p>
    </Modal>
  );
}

export function PortForwardsPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [forwards, setForwards] = useState<PortForwardInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!open) return;
    let disposed = false;
    const load = async () => {
      try {
        const next = await call(api.portForward.list());
        if (!disposed) setForwards(next);
      } catch {
        // silent: panel still works for stopping known forwards
      } finally {
        if (!disposed) setLoading(false);
      }
    };
    setLoading(true);
    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [open, nonce]);

  const stop = async (id: string) => {
    try {
      await call(api.portForward.stop(id));
      setForwards((current) => current.filter((entry) => entry.id !== id));
      toast.success("Port forward stopped");
    } catch (error) {
      toast.error("Cannot stop port forward", errorText(error));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={720}
      title="Port forwards"
      subtitle="Loopback listeners tunnelled to pods in connected clusters"
      footer={
        <Button variant="secondary" onClick={() => setNonce((value) => value + 1)}>
          Refresh
        </Button>
      }
    >
      {loading && forwards.length === 0 ? (
        <div className="flex h-32 items-center justify-center">
          <Spinner label="Reading active forwards…" />
        </div>
      ) : forwards.length === 0 ? (
        <EmptyState
          icon={<Plug />}
          title="No active port forwards"
          description="Open a Pod, switch to Overview, and use the Ports section (or the Plug button in the details header) to forward a container port."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-theme-border">
          <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_90px_40px] gap-2 border-b border-theme-border bg-theme-base px-3 py-1.5 text-[10px] uppercase tracking-wide text-theme-text-tertiary">
            <span>Pod</span>
            <span>Local</span>
            <span>Remote</span>
            <span>Started</span>
            <span />
          </div>
          {forwards.map((entry) => (
            <div
              key={entry.id}
              className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_90px_40px] items-center gap-2 border-b-subtle px-3 py-1.5 last:border-0"
            >
              <div className="min-w-0">
                <div className="truncate font-mono text-[11px] text-theme-text-primary">{entry.pod}</div>
                <div className="truncate text-[10px] text-theme-text-tertiary">{entry.namespace}</div>
              </div>
              <button
                type="button"
                title="Open in browser"
                className="flex items-center gap-1 font-mono text-[11px] text-accent-text hover:underline"
                onClick={() => void api.app.openExternal(`http://127.0.0.1:${entry.localPort}`)}
              >
                :{entry.localPort}
                <ExternalLink className="h-2.5 w-2.5" />
              </button>
              <span className="font-mono text-[11px] text-theme-text-secondary">{entry.remotePort}</span>
              <span className="text-[10px] text-theme-text-tertiary">
                {formatRelativeTime(new Date(entry.startedAt).toISOString())}
              </span>
              <button
                type="button"
                title="Stop forward"
                className="rounded p-1 text-theme-text-tertiary hover:bg-theme-hover hover:text-red-500"
                onClick={() => void stop(entry.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
