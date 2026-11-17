import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useSessionStore, sameRef } from "../../stores/session-store";
import { getKindIcon } from "../../lib/icons";
import { cn } from "../../lib/cn";

function useTabs(clusterId: string) {
  const session = useSessionStore((state) => state.sessions[clusterId]);
  const resources = session?.resources ?? [];
  const tabs = session?.resourceTabs ?? [];
  const active = session?.details?.ref ?? null;
  return { session, resources, tabs, active };
}

function TabChip({
  clusterId,
  tab,
  resources,
  active,
  compact,
}: {
  clusterId: string;
  tab: NonNullable<ReturnType<typeof useTabs>["tabs"]>[number];
  resources: ReturnType<typeof useTabs>["resources"];
  active: ReturnType<typeof useTabs>["active"];
  compact?: boolean;
}) {
  const activateResource = useSessionStore((state) => state.activateResource);
  const closeResourceTab = useSessionStore((state) => state.closeResourceTab);
  const isActive = active ? sameRef(active, tab) : false;
  const info = resources.find((entry) => entry.apiVersion === tab.apiVersion && entry.kind === tab.kind);
  const Icon = getKindIcon(tab.kind, info?.group);
  return (
    <div
      className={cn(
        "group/rtab flex h-6 max-w-[17rem] shrink-0 items-center gap-1 rounded border px-1.5 text-[11px] transition-colors",
        isActive
          ? "border-theme-border bg-theme-surface text-theme-text-primary"
          : "border-transparent text-theme-text-tertiary hover:bg-theme-hover/60 hover:text-theme-text-secondary",
      )}
      title={`${tab.kind}/${tab.name}${tab.namespace ? ` · ${tab.namespace}` : ""}`}
    >
      <button
        type="button"
        className="flex min-w-0 items-center gap-1"
        onClick={() => activateResource(clusterId, tab)}
      >
        <Icon className={cn("h-3 w-3 shrink-0", isActive ? "text-accent-text" : "text-theme-text-tertiary")} />
        <span className="truncate">{tab.name}</span>
        {!compact ? <span className="shrink-0 text-[9px] text-theme-text-disabled">{tab.kind}</span> : null}
      </button>
      <button
        type="button"
        className="shrink-0 rounded p-0.5 text-theme-text-tertiary opacity-0 hover:bg-theme-hover hover:text-theme-text-primary group-hover/rtab:opacity-100"
        title="Close resource tab"
        onClick={() => closeResourceTab(clusterId, tab)}
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}

/** Open-resource tabs inside a cluster (Freelens-style detail switching). */
export function ResourceTabs({ clusterId, onCollapse }: { clusterId: string; onCollapse: () => void }) {
  const { resources, tabs, active } = useTabs(clusterId);
  if (tabs.length === 0) return null;

  return (
    <div className="flex h-8 shrink-0 items-center gap-1 overflow-x-auto border-b border-theme-border bg-theme-base px-2">
      {tabs.map((tab) => (
        <TabChip
          key={`${tab.apiVersion}|${tab.kind}|${tab.namespace ?? ""}|${tab.name}`}
          clusterId={clusterId}
          tab={tab}
          resources={resources}
          active={active}
        />
      ))}
      <button
        type="button"
        className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded text-theme-text-tertiary hover:bg-theme-hover hover:text-theme-text-primary"
        title="Collapse open resource tabs to the bottom tray"
        onClick={onCollapse}
      >
        <ChevronUp className="h-3 w-3" />
      </button>
    </div>
  );
}

/**
 * Collapsed resource tabs live in a slim shadow tray just above the terminal
 * dock. Every tab is still rendered and clickable, so the strip can be brought
 * back at any time without losing the open resources.
 */
export function ResourceTabsTray({ clusterId, onExpand }: { clusterId: string; onExpand: () => void }) {
  const { resources, tabs, active } = useTabs(clusterId);
  if (tabs.length === 0) return null;

  return (
    <div className="flex h-8 shrink-0 items-center gap-1 overflow-x-auto border-t border-theme-border bg-theme-elevated px-2 shadow-[0_-6px_16px_rgba(0,0,0,0.18)]">
      <button
        type="button"
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-theme-text-tertiary hover:bg-theme-hover hover:text-theme-text-primary"
        title="Restore open resource tabs to the top"
        onClick={onExpand}
      >
        <ChevronDown className="h-3 w-3" />
      </button>
      <span className="shrink-0 pr-1 text-[9px] font-semibold uppercase tracking-wider text-theme-text-tertiary">
        {tabs.length} open
      </span>
      {tabs.map((tab) => (
        <TabChip
          key={`${tab.apiVersion}|${tab.kind}|${tab.namespace ?? ""}|${tab.name}`}
          clusterId={clusterId}
          tab={tab}
          resources={resources}
          active={active}
          compact
        />
      ))}
    </div>
  );
}
