import { useMemo, useState } from "react";
import { Loader2, Network, Plug, ShieldCheck } from "lucide-react";
import { api, call, errorText } from "../../lib/api";
import { toast } from "../../design-system/components/Toast";
import { Button } from "../../design-system/components/Button";
import { useCatalogStore } from "../../stores/catalog-store";
import { StartPortForwardDialog } from "../port-forward/PortForwardDialog";
import { AgeProperty, DetailSection, Property, PropertyList } from "./DetailSections";
import { useServiceEndpointSlices, useServiceEndpointsDetail } from "./useDetailsData";

interface ServiceOverviewProps {
  object: any;
  clusterId: string;
  onNavigate: (kind: string, name: string, namespace?: string, apiVersion?: string) => void;
}

interface SliceView {
  name: string;
  addressType: string;
  ready: number;
  total: number;
  addresses: number;
}

/**
 * Service details: Radar's port cards with live port-forward actions, the
 * EndpointSlices that back the Service (ready/total per slice, clickable) and
 * the target Pods the forward buttons use.
 */
export function ServiceOverview({ object, clusterId, onNavigate }: ServiceOverviewProps) {
  const spec = (object.spec ?? {}) as Record<string, any>;
  const type = (spec.type as string | undefined) ?? "ClusterIP";
  const namespace = object.metadata?.namespace as string | undefined;
  const serviceName = object.metadata?.name as string | undefined;
  const hasSelector = Object.keys(spec.selector ?? {}).length > 0;
  const lbIngress = (object.status?.loadBalancer?.ingress ?? []) as Array<{ ip?: string; hostname?: string }>;
  const isExternalName = type === "ExternalName";

  const endpoints = useServiceEndpointsDetail(clusterId, namespace, serviceName);
  const slices = useServiceEndpointSlices(clusterId, namespace, serviceName);

  const sliceData = useMemo(() => {
    const rawSlices = (slices.items ?? []) as any[];
    const views: SliceView[] = [];
    const pods: string[] = [];
    const resolvedPorts: Array<{ name?: string; port?: number; protocol?: string }> = [];
    for (const slice of rawSlices) {
      const rawEndpoints = (slice.endpoints ?? []) as any[];
      const ready = rawEndpoints.filter((endpoint) => endpoint?.conditions?.ready !== false).length;
      const addresses = rawEndpoints.reduce((sum, endpoint) => sum + (endpoint?.addresses?.length ?? 0), 0);
      views.push({
        name: slice.metadata?.name ?? "–",
        addressType: slice.addressType ?? "Unknown",
        ready,
        total: rawEndpoints.length,
        addresses,
      });
      for (const endpoint of rawEndpoints) {
        if (endpoint?.conditions?.ready === false) continue;
        if (endpoint?.targetRef?.kind === "Pod" && endpoint.targetRef.name) pods.push(endpoint.targetRef.name);
      }
      for (const port of (slice.ports ?? []) as any[]) resolvedPorts.push(port);
    }
    return { views, pods: [...new Set(pods)], resolvedPorts };
  }, [slices.items]);

  const settings = useCatalogStore((state) => state.settings);
  const [busyPort, setBusyPort] = useState<number | null>(null);
  const [dialogPort, setDialogPort] = useState<number | null>(null);

  const targetPod = sliceData.pods[0] ?? endpoints.readyPods[0];

  /** EndpointSlice resolves named targetPorts, so the forward hits the real pod port. */
  const remotePortFor = (port: any): number => {
    const protocol = String(port.protocol ?? "TCP").toUpperCase();
    const candidates = sliceData.resolvedPorts.filter(
      (entry) => String(entry.protocol ?? "TCP").toUpperCase() === protocol,
    );
    const named = candidates.find((entry) => (entry.name ?? "") === (port.name ?? ""));
    const match = named ?? (candidates.length === 1 ? candidates[0] : undefined);
    if (match?.port) return Number(match.port);
    if (typeof port.targetPort === "number") return port.targetPort;
    return Number(port.port);
  };

  const quickForward = async (port: any) => {
    if (!targetPod || !namespace) return;
    const remotePort = remotePortFor(port);
    setBusyPort(Number(port.port));
    try {
      const info = await call(
        api.portForward.start({
          clusterId,
          namespace,
          pod: targetPod,
          remotePort,
          localPort: 0,
        }),
      );
      toast.success(
        `Forwarding localhost:${info.localPort} → ${targetPod}:${remotePort}`,
        "Manage it in the Port forwards panel (Plug in the top bar).",
      );
      if (settings?.portForwardOpenBrowser ?? true) {
        void api.app.openExternal(`http://127.0.0.1:${info.localPort}`);
      }
    } catch (error) {
      toast.error("Cannot start port forward", errorText(error));
    } finally {
      setBusyPort(null);
    }
  };

  const forwardable = (port: any) =>
    Boolean(targetPod) && String(port.protocol ?? "TCP").toUpperCase() === "TCP";

  const showLegacyEndpoints = Boolean(slices.error) || (!slices.loading && sliceData.views.length === 0);

  return (
    <div className="space-y-4">
      {type === "LoadBalancer" && lbIngress.length === 0 ? (
        <Notice tone="warning" title="Load balancer pending">
          The external IP/hostname has not been assigned yet. Check the Events tab for cloud-provider messages.
        </Notice>
      ) : null}
      {!hasSelector && !isExternalName ? (
        <Notice tone="info" title="No pod selector">
          This Service has no selector — its endpoints must be managed manually or by an external controller.
        </Notice>
      ) : null}

      <DetailSection title="Service" icon={<Network />}>
        <PropertyList>
          <Property label="Type" value={type} />
          <Property label={isExternalName ? "External name" : "Cluster IP"} value={isExternalName ? spec.externalName : spec.clusterIP} mono copyable />
          <Property label="Cluster IPs" value={(spec.clusterIPs ?? []).join(", ")} mono />
          <Property label="External IPs" value={(spec.externalIPs ?? []).join(", ")} mono />
          <Property
            label="Load balancer"
            value={lbIngress.map((entry) => entry.ip ?? entry.hostname).filter(Boolean).join(", ")}
            mono
            copyable
          />
          <Property label="Session affinity" value={spec.sessionAffinity ?? "None"} />
          <Property label="External traffic" value={spec.externalTrafficPolicy} />
          <Property label="Internal traffic" value={spec.internalTrafficPolicy} />
          <Property label="IP family policy" value={spec.ipFamilyPolicy} />
          <Property label="IP families" value={(spec.ipFamilies ?? []).join(", ")} />
          <AgeProperty timestamp={object.metadata?.creationTimestamp} />
        </PropertyList>
      </DetailSection>

      <DetailSection title="Ports" icon={<Network />} count={spec.ports?.length ?? 0}>
        {(spec.ports ?? []).length === 0 ? (
          <div className="text-xs text-theme-text-tertiary">No ports.</div>
        ) : (
          <div className="space-y-2">
            {(spec.ports as any[]).map((port, index) => {
              const protocol = String(port.protocol ?? "TCP").toUpperCase();
              const canForward = forwardable(port);
              const remotePort = remotePortFor(port);
              return (
                <div key={`${port.name ?? index}-${port.port}-${protocol}`} className="card-inner">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-[calc(12px*var(--font-scale))] font-medium text-theme-text-primary">
                        {port.name || `port-${index + 1}`}
                      </span>
                      <span className="text-[calc(10px*var(--font-scale))] text-theme-text-tertiary">{protocol}</span>
                      <span className="font-mono text-[calc(11px*var(--font-scale))] text-theme-text-secondary">
                        {port.port}
                        {port.targetPort != null && port.targetPort !== port.port ? ` → ${port.targetPort}` : ""}
                        {port.nodePort ? ` (NodePort: ${port.nodePort})` : ""}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void quickForward(port)}
                        disabled={!canForward || busyPort === Number(port.port)}
                        title={
                          !targetPod
                            ? "No ready pod endpoint to forward to"
                            : protocol !== "TCP"
                              ? "Port forwarding is TCP-only"
                              : `Forward ${remotePort} to a local port and open it in the browser`
                        }
                        className="inline-flex items-center gap-1 rounded bg-theme-elevated px-1.5 py-0.5 text-[calc(10px*var(--font-scale))] text-theme-text-secondary transition-colors hover:bg-theme-hover hover:text-theme-text-primary disabled:cursor-default disabled:opacity-50"
                      >
                        {busyPort === Number(port.port) ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Plug className="h-3 w-3" />
                        )}
                        {port.port}/{protocol}
                      </button>
                      <Button
                        size="xs"
                        variant="ghost"
                        disabled={!canForward}
                        title={canForward ? `Forward through ${targetPod}` : "No ready TCP endpoint"}
                        onClick={() => setDialogPort(remotePort)}
                      >
                        Forward
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DetailSection>

      <DetailSection title="Selector" icon={<ShieldCheck />}>
        <div className="flex flex-wrap items-center gap-1">
          {Object.entries(spec.selector ?? {}).map(([key, value]) => (
            <span key={key} className="badge-sm status-neutral font-mono">
              {key}={String(value)}
            </span>
          ))}
          {!hasSelector ? (
            <span className="text-xs text-theme-text-tertiary">No selector (external or headless).</span>
          ) : (
            <button
              type="button"
              className="ml-2 text-[calc(11px*var(--font-scale))] text-accent-text hover:underline"
              onClick={() => onNavigate("Pod", "", namespace)}
            >
              View pods in Related
            </button>
          )}
        </div>
      </DetailSection>

      {!isExternalName ? (
        <DetailSection
          title="EndpointSlices"
          icon={<Network />}
          count={sliceData.views.length}
          defaultOpen={sliceData.views.length === 0}
        >
          {slices.loading && sliceData.views.length === 0 ? (
            <div className="text-xs text-theme-text-tertiary">Loading EndpointSlices…</div>
          ) : slices.error ? (
            <div className="text-xs text-theme-text-tertiary">EndpointSlice inventory unavailable: {slices.error}</div>
          ) : sliceData.views.length === 0 ? (
            <div className="text-xs text-theme-text-tertiary">No EndpointSlices found for this Service.</div>
          ) : (
            <div className="space-y-2">
              {sliceData.views.map((slice) => (
                <button
                  key={slice.name}
                  type="button"
                  onClick={() => onNavigate("EndpointSlice", slice.name, namespace)}
                  className="card-inner w-full text-left transition-colors hover:bg-theme-hover"
                  title={`Open EndpointSlice ${slice.name}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[calc(12px*var(--font-scale))] font-medium text-theme-text-primary">
                        {slice.name}
                      </div>
                      <div className="mt-0.5 text-[calc(10px*var(--font-scale))] text-theme-text-tertiary">
                        {slice.addressType} address type
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                      <span className={`badge-sm ${sliceTone(slice.ready, slice.total)}`}>
                        {slice.ready}/{slice.total} ready
                      </span>
                      <span className="badge-sm status-neutral">{slice.addresses} addresses</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {showLegacyEndpoints ? (
            <div className="mt-3 space-y-2">
              <div className="text-[calc(10px*var(--font-scale))] uppercase tracking-wide text-theme-text-tertiary">
                Endpoints addresses
              </div>
              {endpoints.loading && !endpoints.exists && !endpoints.error ? (
                <div className="text-xs text-theme-text-tertiary">Loading endpoints…</div>
              ) : endpoints.error ? (
                <div className="text-xs text-theme-text-tertiary">Endpoints unavailable: {endpoints.error}</div>
              ) : !endpoints.exists ? (
                <div className="text-xs text-theme-text-tertiary">No Endpoints object exists for this Service.</div>
              ) : endpoints.ready.length === 0 && endpoints.notReady.length === 0 ? (
                <div className="text-xs text-theme-text-tertiary">No addresses are registered for this Service.</div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1">
                    {endpoints.ready.map((ip) => (
                      <span key={`ready-${ip}`} className="badge-sm status-healthy font-mono">
                        {ip}
                      </span>
                    ))}
                    {endpoints.notReady.map((ip) => (
                      <span key={`notready-${ip}`} className="badge-sm status-degraded font-mono">
                        {ip}
                      </span>
                    ))}
                  </div>
                  <div className="text-[calc(11px*var(--font-scale))] text-theme-text-tertiary">
                    {endpoints.ready.length} ready
                    {endpoints.notReady.length > 0 ? ` · ${endpoints.notReady.length} not ready` : ""}
                  </div>
                </>
              )}
            </div>
          ) : null}
        </DetailSection>
      ) : null}

      <StartPortForwardDialog
        open={dialogPort !== null}
        onClose={() => setDialogPort(null)}
        clusterId={clusterId}
        namespace={namespace ?? ""}
        pod={targetPod ?? ""}
        defaultRemotePort={dialogPort ?? undefined}
      />
    </div>
  );
}

function sliceTone(ready: number, total: number): string {
  if (total === 0) return "status-unknown";
  if (ready === total) return "status-healthy";
  if (ready > 0) return "status-degraded";
  return "status-unhealthy";
}

function Notice({ tone, title, children }: { tone: "info" | "warning"; title: string; children: React.ReactNode }) {
  return (
    <div
      className={
        tone === "warning"
          ? "rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[calc(12px*var(--font-scale))] text-amber-700 dark:text-amber-300"
          : "rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-[calc(12px*var(--font-scale))] text-sky-700 dark:text-sky-300"
      }
    >
      <div className="font-medium">{title}</div>
      <div className="mt-1 text-xs">{children}</div>
    </div>
  );
}
