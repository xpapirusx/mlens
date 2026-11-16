import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ChevronLeft,
  Copy,
  FileCode,
  FileText,
  Layers,
  ListTree,
  Maximize2,
  Minimize2,
  RefreshCw,
  SquareTerminal,
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
import { Tabs } from "../../design-system/components/Tabs";
import { toast } from "../../design-system/components/Toast";
import { api, call, errorText } from "../../lib/api";
import { useEvents, useRelatedResources, useResourceObject } from "./useDetailsData";
import { OverviewTab } from "./OverviewTab";
import { DetailsTab } from "./DetailsTab";
import { YamlTab } from "./YamlTab";
import { EventsTab } from "./EventsTab";
import { LogsTab } from "./LogsTab";
import { RelatedTab } from "./RelatedTab";
import { MetricsTab } from "./MetricsTab";

export function ResourceDetails({ clusterId }: { clusterId: string }) {
  const details = useSessionStore((state) => state.sessions[clusterId]?.details ?? null);
  const resources = useSessionStore((state) => state.sessions[clusterId]?.resources ?? []);
  const setDetailsTab = useSessionStore((state) => state.setDetailsTab);
  const closeDetails = useSessionStore((state) => state.closeDetails);
  const detailsBack = useSessionStore((state) => state.detailsBack);
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

  const tab: DetailTab = details?.tab ?? "overview";
  const events = useEvents(clusterId, details?.ref ?? null, refreshSeconds, tab === "events");
  const related = useRelatedResources(clusterId, details?.ref ?? null, object, tab === "related");

  const [width, setWidth] = useState(560);
  const [expanded, setExpanded] = useState(false);
  const [resizing, setResizing] = useState(false);

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

  if (!details) return null;

  const navigate = (kind: string, name: string, namespace?: string) => {
    const target = resources.find(
      (entry) => entry.kind.toLowerCase() === kind.toLowerCase() && (namespace ? entry.namespaced : true),
    );
    if (!target) {
      toast.error("Cannot open related resource", `${kind} is not discovered in this cluster.`);
      return;
    }
    openDetails(clusterId, {
      clusterId,
      apiVersion: target.apiVersion,
      kind: target.kind,
      namespace: namespace ?? (target.namespaced ? object?.metadata?.namespace : undefined),
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

  const status = object ? resourceStatus(object, details.ref.kind) : null;
  const Icon = getKindIcon(details.ref.kind, resource?.group);
  const isPod = details.ref.kind === "Pod";
  const fullHeightTab = tab === "yaml" || tab === "logs";

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
              title="Back to the previously opened resource"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="shell-icon-button h-6 w-6"
              onClick={() => void data.refresh()}
              title="Refresh"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", data.loading && "animate-spin")} />
            </button>
            {isPod ? (
              <button type="button" className="shell-icon-button h-6 w-6" onClick={() => void openShell()} title="Exec into pod">
                <SquareTerminal className="h-3.5 w-3.5" />
              </button>
            ) : null}
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

        <div className="px-1.5">
          <Tabs<DetailTab>
            value={tab}
            onChange={(next) => setDetailsTab(clusterId, next)}
            tabs={[
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
              { id: "logs", label: "Logs", icon: <SquareTerminal /> },
              { id: "related", label: "Related", icon: <ListTree /> },
              { id: "metrics", label: "Metrics", icon: <Activity /> },
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
              <OverviewTab object={object} resource={resource ?? fallbackResource(details.ref)} onNavigate={navigate} />
            ) : null}
            {tab === "details" ? <DetailsTab object={object} /> : null}
            {tab === "yaml" ? (
              <YamlTab clusterId={clusterId} object={object} onApplied={() => void data.refresh()} />
            ) : null}
            {tab === "events" ? (
              <EventsTab events={events.events} loading={events.loading} error={events.error} />
            ) : null}
            {tab === "logs" ? <LogsTab clusterId={clusterId} object={object} /> : null}
            {tab === "related" ? (
              <RelatedTab
                groups={related.groups}
                loading={related.loading}
                error={related.error}
                onNavigate={navigate}
              />
            ) : null}
            {tab === "metrics" ? (
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
    </aside>
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
