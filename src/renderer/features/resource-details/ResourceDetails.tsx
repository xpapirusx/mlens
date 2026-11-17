import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Ban,
  Box,
  ChevronDown,
  ChevronLeft,
  Copy,
  FileCode,
  FileText,
  Layers,
  Maximize2,
  Minimize2,
  Network,
  Pause,
  Play,
  Plug,
  RotateCcw,
  RotateCw,
  Scale,
  ScrollText,
  Server,
  SquareTerminal,
  Trash2,
  X,
} from "lucide-react";
import type { ApiResourceInfo } from "@shared/types";
import { useCatalogStore } from "../../stores/catalog-store";
import { useSessionStore, type DetailTab } from "../../stores/session-store";
import { getKindIcon, kindColor, kindLabel } from "../../lib/icons";
import { resourceStatus, toneClass } from "../../lib/status";
import { formatAge } from "../../lib/format";
import { cn } from "../../lib/cn";
import { Spinner } from "../../design-system/components/Spinner";
import { InlineError } from "../../design-system/components/EmptyState";
import { Button } from "../../design-system/components/Button";
import { ConfirmActionDialog, ScaleDialog } from "../resource-browser/ResourceDialogs";
import { StartPortForwardDialog } from "../port-forward/PortForwardDialog";
import { EditDataDialog } from "./EditDataDialog";
import { SetImageDialog } from "./SetImageDialog";
import { NodeDrainDialog } from "./NodeDrainDialog";
import { NodeDebugDialog } from "./NodeDebugDialog";
import { Tabs } from "../../design-system/components/Tabs";
import { toast } from "../../design-system/components/Toast";
import { api, call, errorText } from "../../lib/api";
import {
  findReplicaScaler,
  isDeploymentPaused,
  isSuspended,
  restartWorkload,
  scaleWorkload,
  setWorkloadPaused,
  setWorkloadSuspended,
  triggerCronJob,
  workloadCapabilities,
} from "../../lib/workload-actions";
import { useEvents, useRelatedResources, useResourceObject } from "./useDetailsData";
import { OverviewTab } from "./OverviewTab";
import { DetailsTab } from "./DetailsTab";
import { YamlTab } from "./YamlTab";
import { EventsTab } from "./EventsTab";
import { RelatedTab } from "./RelatedTab";
import { LogsTab } from "./LogsTab";
import { MetricsTab } from "./MetricsTab";

export function ResourceDetails({ clusterId }: { clusterId: string }) {
  const details = useSessionStore((state) => state.sessions[clusterId]?.details ?? null);
  const minimized = useSessionStore((state) => state.sessions[clusterId]?.detailsMinimized ?? false);
  const resources = useSessionStore((state) => state.sessions[clusterId]?.resources ?? []);
  const setDetailsTab = useSessionStore((state) => state.setDetailsTab);
  const closeDetails = useSessionStore((state) => state.closeDetails);
  const minimizeDetails = useSessionStore((state) => state.minimizeDetails);
  const detailsBack = useSessionStore((state) => state.detailsBack);
  const detailsHistory = useSessionStore((state) => state.sessions[clusterId]?.detailsHistory ?? []);
  const openDetails = useSessionStore((state) => state.openDetails);
  const openTerminal = useSessionStore((state) => state.openTerminal);
  const settings = useCatalogStore((state) => state.settings);

  const refreshSeconds = settings?.refreshIntervalSeconds ?? 30;
  const data = useResourceObject(clusterId, details?.ref ?? null, Math.min(15, refreshSeconds || 15));
  const object = data.object;

  const resource: ApiResourceInfo | undefined = useMemo(
    () =>
      details
        ? resources.find(
            (entry) => entry.apiVersion === details.ref.apiVersion && entry.kind === details.ref.kind,
          )
        : undefined,
    [resources, details],
  );

  const isHelmRelease = details?.ref.kind === "HelmRelease" && details?.ref.apiVersion === "helm.sh/v1";
  const requestedTab: DetailTab = details?.tab ?? "overview";
  // A Helm release only has the Overview surface — values and manifests live
  // there, and the other tabs would query a kind the API server does not serve.
  const tab: DetailTab = isHelmRelease && requestedTab !== "overview" ? "overview" : requestedTab;
  const events = useEvents(clusterId, details?.ref ?? null, refreshSeconds, tab === "events");
  const related = useRelatedResources(clusterId, details?.ref ?? null, object, tab === "related");

  const [width, setWidth] = useState(560);
  const [expanded, setExpanded] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [forwardPort, setForwardPort] = useState<number | null>(null);
  const [editDataOpen, setEditDataOpen] = useState(false);
  const [scaleOpen, setScaleOpen] = useState(false);
  const [restartConfirm, setRestartConfirm] = useState(false);
  const [setImageOpen, setSetImageOpen] = useState(false);
  const [drainOpen, setDrainOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  useEffect(() => {
    setExpanded(false);
  }, [details?.ref.name, details?.ref.kind]);

  useEffect(() => {
    if (!resizing) return;
    const onMove = (event: PointerEvent) => {
      const next = window.innerWidth - event.clientX;
      setWidth(Math.min(Math.max(460, next), Math.floor(window.innerWidth * 0.74)));
    };
    const onUp = () => setResizing(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [resizing]);

  if (!details || minimized) return null;

  const navigate = (kind: string, name: string, namespace?: string, apiVersion?: string) => {
    if (!kind || !name) return;
    const lower = kind.toLowerCase();
    const target = resources.find(
      (entry) => entry.kind.toLowerCase() === lower && (!apiVersion || entry.apiVersion === apiVersion),
    );
    const chosenApiVersion = apiVersion ?? target?.apiVersion;
    if (!chosenApiVersion) {
      toast.error("Cannot open related resource", `${kind} has no apiVersion in the relationship data.`);
      return;
    }
    const isNamespaced = target ? target.namespaced : Boolean(namespace);
    openDetails(clusterId, {
      clusterId,
      apiVersion: chosenApiVersion,
      kind: target?.kind ?? kind,
      namespace: isNamespaced ? (namespace ?? object?.metadata?.namespace) : undefined,
      name,
    });
  };

  const openShell = async () => {
    if (!object?.metadata?.namespace || !object.metadata.name) return;
    try {
      const containers = await call(
        api.pods.containers(clusterId, object.metadata.namespace, object.metadata.name),
      );
      const container = containers[0]?.name;
      if (!container) throw new Error("Pod has no containers");
      openTerminal(clusterId, {
        type: "pod",
        clusterId,
        namespace: object.metadata.namespace,
        pod: object.metadata.name,
        container,
        shell: "/bin/sh",
      });
    } catch (error) {
      toast.error("Cannot open container shell", errorText(error));
    }
  };

  const quickPortForward = async (port: number) => {
    if (!details?.ref.namespace) return;
    try {
      const info = await call(
        api.portForward.start({
          clusterId,
          namespace: details.ref.namespace,
          pod: details.ref.name,
          remotePort: port,
          localPort: 0,
        }),
      );
      toast.success(
        `Forwarding localhost:${info.localPort} → ${details.ref.name}:${port}`,
        "Manage it in the Port forwards panel (Plug in the top bar).",
      );
    } catch (error) {
      toast.error("Cannot start port forward", errorText(error));
    }
  };

  const deleteResource = async () => {
    if (!object) return;
    setDeleting(true);
    try {
      await call(
        api.resources.delete({
          clusterId,
          apiVersion: details.ref.apiVersion,
          kind: details.ref.kind,
          namespace: details.ref.namespace,
          name: details.ref.name,
          propagationPolicy: "Background",
        }),
      );
      toast.success(`${details.ref.kind} deleted`, details.ref.name);
      setConfirmDelete(false);
      closeDetails(clusterId);
    } catch (error) {
      toast.error("Delete failed", errorText(error));
    } finally {
      setDeleting(false);
    }
  };

  const status = object ? resourceStatus(object, details.ref.kind) : null;
  const Icon = getKindIcon(details.ref.kind, resource?.group);
  const isPod = details.ref.kind === "Pod";
  const isNode = details.ref.kind === "Node";
  const caps = workloadCapabilities(details.ref.kind, details.ref.apiVersion);
  const fullHeightTab = tab === "yaml" || tab === "logs";

  const actionTarget = () => ({
    clusterId,
    apiVersion: details.ref.apiVersion,
    kind: details.ref.kind,
    namespace: details.ref.namespace,
    name: details.ref.name,
  });

  const openScaleDialog = async () => {
    const scaler = await findReplicaScaler(
      clusterId,
      details.ref.namespace,
      details.ref.kind,
      details.ref.name,
    );
    if (scaler) {
      toast.error(
        "Replicas are controlled by an autoscaler",
        `${scaler.kind}/${scaler.name} manages this workload; change the scaler instead.`,
      );
      return;
    }
    setScaleOpen(true);
  };

  const applyScale = async (replicas: number) => {
    setActionBusy("scale");
    try {
      await scaleWorkload(actionTarget(), replicas);
      toast.success("Scaled", `${details.ref.name} → ${replicas} replicas`);
      setScaleOpen(false);
      await data.refresh();
    } catch (error) {
      toast.error("Scale failed", errorText(error));
    } finally {
      setActionBusy(null);
    }
  };

  const applyRestart = async () => {
    setActionBusy("restart");
    try {
      await restartWorkload(actionTarget());
      toast.success("Rollout restarted", details.ref.name);
      setRestartConfirm(false);
      await data.refresh();
    } catch (error) {
      toast.error("Restart failed", errorText(error));
    } finally {
      setActionBusy(null);
    }
  };

  const togglePause = async () => {
    if (!object) return;
    const paused = isDeploymentPaused(object);
    setActionBusy("pause");
    try {
      await setWorkloadPaused(actionTarget(), !paused);
      toast.success(paused ? "Rollout resumed" : "Rollout paused", details.ref.name);
      await data.refresh();
    } catch (error) {
      toast.error(paused ? "Resume failed" : "Pause failed", errorText(error));
    } finally {
      setActionBusy(null);
    }
  };

  const toggleSuspend = async () => {
    if (!object) return;
    const suspended = isSuspended(object);
    setActionBusy("suspend");
    try {
      await setWorkloadSuspended(actionTarget(), !suspended);
      toast.success(suspended ? "Resource resumed" : "Resource suspended", details.ref.name);
      await data.refresh();
    } catch (error) {
      toast.error(suspended ? "Resume failed" : "Suspend failed", errorText(error));
    } finally {
      setActionBusy(null);
    }
  };

  const trigger = async () => {
    if (!object) return;
    setActionBusy("trigger");
    try {
      const name = await triggerCronJob(clusterId, object);
      toast.success("CronJob triggered", `Created Job ${name}`);
      await data.refresh();
    } catch (error) {
      toast.error("Trigger failed", errorText(error));
    } finally {
      setActionBusy(null);
    }
  };

  const toggleCordon = async () => {
    if (!object) return;
    const cordoned = object.spec?.unschedulable === true;
    setActionBusy("cordon");
    try {
      await call(
        api.resources.patch({
          clusterId,
          apiVersion: details.ref.apiVersion,
          kind: details.ref.kind,
          namespace: details.ref.namespace,
          name: details.ref.name,
          patch: { spec: { unschedulable: !cordoned } },
        }),
      );
      toast.success(cordoned ? "Node uncordoned" : "Node cordoned", details.ref.name);
      await data.refresh();
    } catch (error) {
      toast.error(cordoned ? "Uncordon failed" : "Cordon failed", errorText(error));
    } finally {
      setActionBusy(null);
    }
  };

  return (
    <aside
      className={cn(
        "absolute inset-y-0 right-0 z-30 flex flex-col border-l border-theme-border bg-theme-surface shadow-drawer",
        resizing && "select-none",
      )}
      style={{ width: expanded ? "calc(100% - 16px)" : width }}
      aria-label="Resource details"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        className="absolute bottom-0 left-0 top-0 z-10 w-1.5 cursor-col-resize hover:bg-skyhook-500/50"
        onPointerDown={(event) => {
          event.preventDefault();
          setExpanded(false);
          setResizing(true);
        }}
      />

      <div className="shrink-0 border-b border-theme-border">
        <div className="flex items-center gap-1.5 px-3 pt-2.5">
          <span className={cn("kind-outline", kindColor(details.ref.kind))}>
            <Icon className="h-3 w-3" />
            {kindLabel(details.ref.kind, resource?.plural)}
          </span>
          {status ? <span className={cn("badge-sm", toneClass(status.tone))}>{status.text}</span> : null}
          {object?.metadata?.deletionTimestamp ? (
            <span className="badge-sm status-degraded">Terminating</span>
          ) : null}
          <span className="ml-1 font-mono text-[10px] text-theme-text-disabled">{details.ref.apiVersion}</span>

          <div className="ml-auto flex items-center gap-0.5">
            <button
              type="button"
              className="shell-icon-button h-6 w-6 disabled:opacity-30"
              onClick={() => detailsBack(clusterId)}
              disabled={detailsHistory.length === 0}
              title="Back to the previously opened resource"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>

            {isHelmRelease ? null : (
              <DetailIcon
                icon={<Trash2 />}
                title="Delete resource"
                danger
                onClick={() => setConfirmDelete(true)}
              />
            )}
            <DetailIcon
              icon={<RotateCw />}
              title="Reload data"
              disabled={data.loading}
              onClick={() => void data.refresh()}
            />
            <button
              type="button"
              className="shell-icon-button h-6 w-6"
              onClick={() => setExpanded((value) => !value)}
              title={expanded ? "Restore drawer" : "Expand drawer"}
            >
              {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              className="shell-icon-button h-6 w-6"
              onClick={() => minimizeDetails(clusterId)}
              title="Minimize details (open resource tabs stay)"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="shell-icon-button h-6 w-6"
              onClick={() => closeDetails(clusterId)}
              title="Close details"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 pb-2 pt-1">
          <h2 className="min-w-0 truncate text-[16px] font-semibold text-theme-text-primary" title={details.ref.name}>
            {details.ref.name}
          </h2>
          <button
            type="button"
            title="Copy name"
            className="shrink-0 rounded p-0.5 text-theme-text-tertiary hover:bg-theme-hover hover:text-theme-text-primary"
            onClick={() => void navigator.clipboard.writeText(details.ref.name)}
          >
            <Copy className="h-3 w-3" />
          </button>
          {details.ref.namespace ? (
            <span className="shrink-0 rounded bg-theme-elevated px-1.5 py-0.5 font-mono text-[10px] text-theme-text-tertiary">
              {details.ref.namespace}
            </span>
          ) : null}
          {object ? (
            <span className="ml-auto shrink-0 text-[10px] text-theme-text-disabled">
              {formatAge(object.metadata?.creationTimestamp)} old
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1 px-3 pb-1.5">
          {isPod ? (
            <>
              <DetailAction icon={<ScrollText />} label="Logs" onClick={() => setDetailsTab(clusterId, "logs")} />
              <DetailAction icon={<SquareTerminal />} label="Exec" onClick={() => void openShell()} />
              <DetailAction icon={<Plug />} label="Forward" onClick={() => setForwardPort(8080)} />
            </>
          ) : null}

          {caps.scalable ? (
            <DetailAction
              icon={<Scale />}
              label="Scale"
              busy={actionBusy === "scale"}
              onClick={() => void openScaleDialog()}
            />
          ) : null}

          {caps.restartable ? (
            <DetailAction
              icon={<RotateCcw />}
              label="Restart"
              busy={actionBusy === "restart"}
              onClick={() => {
                if (isDeploymentPaused(object)) {
                  toast.error("Rollout is paused", "Resume the rollout before restarting it.");
                  return;
                }
                setRestartConfirm(true);
              }}
            />
          ) : null}

          {caps.pausable ? (
            <DetailAction
              icon={isDeploymentPaused(object) ? <Play /> : <Pause />}
              label={isDeploymentPaused(object) ? "Resume rollout" : "Pause rollout"}
              busy={actionBusy === "pause"}
              onClick={() => void togglePause()}
            />
          ) : null}

          {caps.suspendable ? (
            <DetailAction
              icon={isSuspended(object) ? <Play /> : <Pause />}
              label={isSuspended(object) ? "Resume" : "Suspend"}
              busy={actionBusy === "suspend"}
              onClick={() => void toggleSuspend()}
            />
          ) : null}

          {caps.imageEditable ? (
            <DetailAction icon={<Box />} label="Set image" onClick={() => setSetImageOpen(true)} />
          ) : null}

          {caps.triggerable ? (
            <DetailAction
              icon={<Play />}
              label="Trigger"
              busy={actionBusy === "trigger"}
              onClick={() => void trigger()}
            />
          ) : null}

          {isNode ? (
            <DetailAction
              icon={<Ban />}
              label={object?.spec?.unschedulable ? "Uncordon" : "Cordon"}
              busy={actionBusy === "cordon"}
              onClick={() => void toggleCordon()}
            />
          ) : null}

          {isNode ? (
            <DetailAction
              icon={<Server />}
              label="Drain"
              busy={actionBusy === "drain"}
              onClick={() => setDrainOpen(true)}
            />
          ) : null}

          {isNode ? (
            <DetailAction
              icon={<SquareTerminal />}
              label="Debug shell"
              onClick={() => setDebugOpen(true)}
            />
          ) : null}
        </div>

        <div className="px-1.5">
          <Tabs<DetailTab>
            value={tab}
            onChange={(next) => setDetailsTab(clusterId, next)}
            tabs={isHelmRelease ? [
              { id: "overview", label: "Overview", icon: <Layers /> },
            ] : [
              { id: "overview", label: "Overview", icon: <Layers /> },
              { id: "details", label: "Details", icon: <FileText /> },
              { id: "yaml", label: "YAML", icon: <FileCode /> },
              {
                id: "events",
                label: "Events",
                icon: <Activity />,
                badge: events.events.length ? (
                  <span className="rounded bg-theme-elevated px-1 font-mono text-[9px] text-theme-text-tertiary">
                    {events.events.length}
                  </span>
                ) : null,
              },
              {
                id: "related",
                label: "Related",
                icon: <Network />,
                badge: related.groups.length ? (
                  <span className="rounded bg-theme-elevated px-1 font-mono text-[9px] text-theme-text-tertiary">
                    {related.groups.reduce((sum, group) => sum + group.items.length, 0)}
                  </span>
                ) : null,
              },
              ...(isPod
                ? [{ id: "logs" as const, label: "Logs", icon: <SquareTerminal /> }]
                : []),
              ...(isPod ? [{ id: "metrics" as const, label: "Metrics", icon: <Activity /> }] : []),
            ]}
          />
        </div>
      </div>

      <div className={cn("min-h-0 flex-1", fullHeightTab ? "overflow-hidden" : "overflow-y-auto")}>
        {!object ? (
          data.error ? (
            <div className="p-3">
              <InlineError
                title={`Cannot load ${details.ref.kind}`}
                message={data.error}
                action={
                  <Button size="sm" variant="secondary" onClick={() => void data.refresh()}>
                    Retry
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <Spinner label="Loading resource…" />
            </div>
          )
        ) : (
          <>
            {tab === "overview" ? (
              <OverviewTab
                object={object}
                resource={resource ?? fallbackResource(details.ref)}
                onNavigate={navigate}
                onPortForward={(port) => setForwardPort(port)}
                onQuickPortForward={(port) => void quickPortForward(port)}
                onEditData={() => setEditDataOpen(true)}
                onScale={() => void openScaleDialog()}
                onTogglePause={() => void togglePause()}
                onToggleSuspend={() => void toggleSuspend()}
                onToggleCordon={() => void toggleCordon()}
                clusterId={clusterId}
              />
            ) : null}
            {tab === "details" ? (
              <DetailsTab
                object={object}
                clusterId={clusterId}
                onNavigate={navigate}
                onMetadataChanged={() => void data.refresh()}
              />
            ) : null}
            {tab === "yaml" ? (
              <YamlTab clusterId={clusterId} object={object} onApplied={() => void data.refresh()} />
            ) : null}
            {tab === "events" ? (
              <EventsTab events={events.events} loading={events.loading} error={events.error} />
            ) : null}
            {tab === "related" ? (
              <RelatedTab
                groups={related.groups}
                loading={related.loading}
                error={related.error}
                warnings={related.warnings}
                onNavigate={navigate}
              />
            ) : null}
            {tab === "logs" && isPod ? <LogsTab clusterId={clusterId} object={object} /> : null}
            {tab === "metrics" && isPod ? (
              <MetricsTab
                clusterId={clusterId}
                object={object}
                resources={resources}
                refreshSeconds={refreshSeconds}
              />
            ) : null}
          </>
        )}
      </div>

      <div className="flex h-6 shrink-0 items-center gap-2 border-t border-theme-border bg-theme-base px-3 text-[10px] text-theme-text-disabled">
        <ChevronLeft className="h-2.5 w-2.5" />
        <span className="font-mono">{resource?.plural ?? details.ref.kind}</span>
        <span className="ml-auto">{data.loading ? "Refreshing…" : "Live data"}</span>
      </div>

      <EditDataDialog
        open={editDataOpen}
        onClose={() => setEditDataOpen(false)}
        clusterId={clusterId}
        object={object}
        onSaved={() => void data.refresh()}
      />

      {isPod && details.ref.namespace && object ? (
        <StartPortForwardDialog
          open={forwardPort !== null}
          onClose={() => setForwardPort(null)}
          clusterId={clusterId}
          namespace={details.ref.namespace}
          pod={details.ref.name}
          defaultRemotePort={forwardPort ?? undefined}
        />
      ) : null}

      <ScaleDialog
        open={scaleOpen}
        onClose={() => setScaleOpen(false)}
        onConfirm={(replicas) => void applyScale(replicas)}
        current={Number(object?.spec?.replicas ?? 1)}
        title={details.ref.name}
        busy={actionBusy === "scale"}
      />

      <ConfirmActionDialog
        open={restartConfirm}
        onClose={() => setRestartConfirm(false)}
        onConfirm={() => void applyRestart()}
        title={`Restart ${details.ref.kind}`}
        confirmLabel="Restart"
        busy={actionBusy === "restart"}
        description={
          <p>
            Patch <span className="inline-code">spec.template.metadata.annotations</span> on{" "}
            <span className="font-medium text-theme-text-primary">{details.ref.name}</span> to trigger a rolling
            restart.
          </p>
        }
      />

      {object ? (
        <SetImageDialog
          open={setImageOpen}
          onClose={() => setSetImageOpen(false)}
          clusterId={clusterId}
          object={object}
          onSaved={() => void data.refresh()}
        />
      ) : null}

      {isNode ? (
        <NodeDrainDialog
          open={drainOpen}
          onClose={() => setDrainOpen(false)}
          clusterId={clusterId}
          node={details.ref.name}
          onDone={() => void data.refresh()}
        />
      ) : null}

      {isNode ? (
        <NodeDebugDialog
          open={debugOpen}
          onClose={() => setDebugOpen(false)}
          clusterId={clusterId}
          nodeName={details.ref.name}
        />
      ) : null}

      <ConfirmActionDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void deleteResource()}
        title={`Delete ${details.ref.kind}`}
        confirmLabel="Delete resource"
        danger
        busy={deleting}
        description={
          <>
            <p>
              Delete <span className="font-medium text-theme-text-primary">{details.ref.name}</span>
              {details.ref.namespace ? ` in ${details.ref.namespace}` : ""}? This cannot be undone.
            </p>
            <p className="mt-2 text-xs text-theme-text-tertiary">
              Dependents are removed with the Background propagation policy.
            </p>
          </>
        }
      />
    </aside>
  );
}

function DetailAction({
  icon,
  label,
  onClick,
  busy,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-theme-text-secondary transition-colors hover:bg-theme-hover hover:text-theme-text-primary disabled:opacity-40 [&>svg]:h-3.5 [&>svg]:w-3.5"
    >
      {icon}
      {label}
    </button>
  );
}

function DetailIcon({
  icon,
  title,
  onClick,
  disabled,
  danger,
}: {
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded-md text-theme-text-primary transition-colors hover:bg-theme-hover disabled:opacity-40 [&>svg]:h-4 [&>svg]:w-4",
        danger && "text-red-400 hover:bg-red-500/10 hover:text-red-300",
      )}
    >
      {icon}
    </button>
  );
}

function fallbackResource(ref: { apiVersion: string; kind: string }): ApiResourceInfo {
  return {
    group: ref.apiVersion.includes("/") ? ref.apiVersion.split("/")[0] : "",
    version: ref.apiVersion.includes("/") ? ref.apiVersion.split("/")[1] : ref.apiVersion,
    apiVersion: ref.apiVersion,
    kind: ref.kind,
    plural: ref.kind.toLowerCase(),
    singular: ref.kind.toLowerCase(),
    namespaced: true,
    verbs: ["get", "list"],
    shortNames: [],
    categories: [],
    isCrd: false,
    printerColumns: [],
    iconKey: ref.kind.toLowerCase(),
    catalogGroup: "other",
  };
}
