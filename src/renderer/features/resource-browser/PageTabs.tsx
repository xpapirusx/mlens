import { useMemo } from "react";
import type { ApiResourceInfo } from "@shared/types";
import { useSessionStore } from "../../stores/session-store";
import { buildResourceGroups, siblingResources } from "../../lib/catalog";
import { getKindIcon, kindLabel } from "../../lib/icons";
import { cn } from "../../lib/cn";

/** Freelens' sibling resource tabs (Pods / Deployments / … in the same group). */
export function PageTabs({ clusterId, resources }: { clusterId: string; resources: ApiResourceInfo[] }) {
  const selected = useSessionStore((state) => state.sessions[clusterId]?.selectedKind ?? null);
  const selectKind = useSessionStore((state) => state.selectKind);

  const groups = useMemo(() => buildResourceGroups(resources), [resources]);
  const siblings = useMemo(() => siblingResources(groups, selected), [groups, selected]);

  if (siblings.length <= 1) return null;

  return (
    <div className="flex h-9 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-theme-border bg-theme-base px-2">
      {siblings.map((resource) => {
        const active = selected?.apiVersion === resource.apiVersion && selected?.kind === resource.kind;
        const Icon = getKindIcon(resource.kind, resource.group);
        return (
          <button
            key={`${resource.apiVersion}/${resource.kind}`}
            type="button"
            onClick={() => selectKind(clusterId, { apiVersion: resource.apiVersion, kind: resource.kind })}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[calc(12px*var(--font-scale))] transition-colors",
              active
                ? "bg-theme-surface text-theme-text-primary shadow-theme-sm ring-1 ring-theme-border"
                : "text-theme-text-tertiary hover:bg-theme-hover/60 hover:text-theme-text-secondary",
            )}
          >
            <Icon className={cn("h-3.5 w-3.5", active ? "text-accent-text" : "text-theme-text-tertiary")} />
            <span className="truncate">{kindLabel(resource.kind, resource.plural)}</span>
          </button>
        );
      })}
    </div>
  );
}
