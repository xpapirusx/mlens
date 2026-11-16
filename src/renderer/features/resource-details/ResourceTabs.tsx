import { X } from "lucide-react";
import { useSessionStore, sameRef } from "../../stores/session-store";
import { getKindIcon } from "../../lib/icons";
import { cn } from "../../lib/cn";

/** Open-resource tabs inside a cluster (Freelens-style detail switching). */
export function ResourceTabs({ clusterId }: { clusterId: string }) {
  const session = useSessionStore((state) => state.sessions[clusterId]);
  const activateResource = useSessionStore((state) => state.activateResource);
  const closeResourceTab = useSessionStore((state) => state.closeResourceTab);
  const resources = session?.resources ?? [];
  const tabs = session?.resourceTabs ?? [];
  const active = session?.details?.ref ?? null;

  if (tabs.length === 0) return null;

  return (
    <div className="flex h-8 shrink-0 items-center gap-1 overflow-x-auto border-b border-theme-border bg-theme-base px-2">
      {tabs.map((tab) => {
        const isActive = active ? sameRef(active, tab) : false;
        const info = resources.find(
          (entry) => entry.apiVersion === tab.apiVersion && entry.kind === tab.kind,
        );
        const Icon = getKindIcon(tab.kind, info?.group);
        return (
          <div
            key={`${tab.apiVersion}|${tab.kind}|${tab.namespace ?? ""}|${tab.name}`}
            className={cn(
              "group/rtab flex h-6 max-w-[17rem] shrink-0 items-center gap-1 rounded border px-1.5 text-[11px] transition-colors",
              isActive
                ? "border-theme-border bg-theme-surface text-theme-text-primary"
                : "border-transparent text-theme-text-tertiary hover:bg-theme-hover/60 hover:text-theme-text-secondary",
            )}
          >
            <button
              type="button"
              className="flex min-w-0 items-center gap-1"
              onClick={() => activateResource(clusterId, tab)}
              title={`${tab.kind}/${tab.name}${tab.namespace ? ` · ${tab.namespace}` : ""}`}
            >
              <Icon className={cn("h-3 w-3 shrink-0", isActive ? "text-accent-text" : "text-theme-text-tertiary")} />
              <span className="truncate">{tab.name}</span>
              <span className="shrink-0 text-[9px] text-theme-text-disabled">{tab.kind}</span>
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
      })}
    </div>
  );
}
