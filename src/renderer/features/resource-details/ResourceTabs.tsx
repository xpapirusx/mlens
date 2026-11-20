import { ChevronUp, X } from "lucide-react";
import type { ResourceKey } from "@shared/types";
import { useSessionStore, type EditorPaneState } from "../../stores/session-store";
import { getKindIcon } from "../../lib/icons";
import { cn } from "../../lib/cn";

const EMPTY_PANES: EditorPaneState[] = [];

/**
 * Collapsed editor area: a slim shadow tray above the terminal dock listing
 * every open resource tab. Clicking a tab (or the chevron) restores the editor;
 * tabs stay mounted in the store, so nothing is lost while minimized.
 */
export function EditorTray({ clusterId }: { clusterId: string }) {
  const panes = useSessionStore(
    (state) => state.sessions[clusterId]?.editor.panes ?? EMPTY_PANES,
  );
  const resources = useSessionStore(
    (state) => state.sessions[clusterId]?.resources ?? EMPTY_RESOURCES,
  );
  const restoreDetails = useSessionStore((state) => state.restoreDetails);
  const setActivePane = useSessionStore((state) => state.setActivePane);
  const activateResource = useSessionStore((state) => state.activateResource);
  const closePaneTab = useSessionStore((state) => state.closePaneTab);

  const entries = panes.flatMap((pane) => pane.tabs.map((tab) => ({ pane, tab })));
  if (entries.length === 0) return null;

  const open = (pane: EditorPaneState, tab: ResourceKey) => {
    restoreDetails(clusterId);
    setActivePane(clusterId, pane.id);
    activateResource(clusterId, tab);
  };

  return (
    <div
      data-editor-tray="true"
      className="flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-t border-theme-border bg-theme-elevated px-2 shadow-[0_-6px_16px_rgba(0,0,0,0.18)]"
    >
      <button
        type="button"
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-theme-text-tertiary hover:bg-theme-hover hover:text-theme-text-primary"
        title="Restore the editor area (⌘⇧B)"
        onClick={() => restoreDetails(clusterId)}
      >
        <ChevronUp className="h-3 w-3" />
      </button>
      <span className="shrink-0 pr-1 text-[calc(9px*var(--font-scale))] font-semibold uppercase tracking-wider text-theme-text-tertiary">
        {entries.length} open
      </span>
      {entries.map(({ pane, tab }) => {
        const info = resources.find(
          (entry) => entry.apiVersion === tab.apiVersion && entry.kind === tab.kind,
        );
        const Icon = getKindIcon(tab.kind, info?.group);
        return (
          <div
            key={`${pane.id}|${tab.apiVersion}|${tab.kind}|${tab.namespace ?? ""}|${tab.name}`}
            className="group/traytab flex h-6 max-w-[15rem] shrink-0 items-center gap-1 rounded border border-theme-border bg-theme-surface px-1.5 text-[calc(11px*var(--font-scale))] text-theme-text-secondary"
            title={`${tab.kind}/${tab.name}${tab.namespace ? ` · ${tab.namespace}` : ""}`}
          >
            <button
              type="button"
              className="flex min-w-0 items-center gap-1"
              onClick={() => open(pane, tab)}
            >
              <Icon className={cn("h-3 w-3 shrink-0 text-theme-text-tertiary")} />
              <span className="truncate">{tab.name}</span>
            </button>
            <button
              type="button"
              className="shrink-0 rounded p-0.5 text-theme-text-tertiary opacity-0 hover:bg-theme-hover hover:text-theme-text-primary group-hover/traytab:opacity-70"
              title="Close tab"
              onClick={() => closePaneTab(clusterId, pane.id, tab)}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

const EMPTY_RESOURCES: never[] = [];
