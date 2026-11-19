import { Blocks, ChevronLeft, ChevronRight, Home, Plus, Rows2, X } from "lucide-react";
import { useCatalogStore } from "../stores/catalog-store";
import { useChromeSessions } from "../stores/session-store";
import { closeClusterTab } from "../lib/cluster-actions";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "../design-system/components/Menu";
import { cn } from "../lib/cn";

export function ClusterTabs() {
  // A14: cluster chrome re-renders on status/info changes only — keystroke
  // session writes (search, dock, drawer) no longer touch the tab strip.
  const sessions = useChromeSessions();
  const activeClusterId = useCatalogStore((state) => state.activeClusterId);
  const setActiveCluster = useCatalogStore((state) => state.setActiveCluster);
  const clusters = useCatalogStore((state) => state.clusters);
  const splitClusterId = useCatalogStore((state) => state.splitClusterId);
  const setSplitCluster = useCatalogStore((state) => state.setSplitCluster);

  const ids = Object.keys(sessions);
  const secondaryId =
    splitClusterId && splitClusterId !== activeClusterId && ids.includes(splitClusterId)
      ? splitClusterId
      : null;

  const closeTab = async (id: string) => {
    await closeClusterTab(id);
  };

  /** Cycle open cluster tabs (the strip order), wrapping at the ends. */
  const switchCluster = (delta: number) => {
    if (ids.length < 2) return;
    const at = activeClusterId ? ids.indexOf(activeClusterId) : -1;
    const next = ids[(at + delta + ids.length) % ids.length];
    if (next) setActiveCluster(next);
  };

  return (
    <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-theme-border bg-theme-sidebar px-2">
      <div className="flex shrink-0 items-center gap-0.1 border-r border-theme-border pr-1">
        <button
          type="button"
          className="shell-icon-button h-6 w-6"
          title="Catalog (home)"
          aria-label="Catalog"
          onClick={() => setActiveCluster(null)}
        >
          <Home className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          className="shell-icon-button h-6 w-6 disabled:opacity-30"
          title="Previous cluster tab (⌘⇧[)"
          aria-label="Previous cluster tab"
          disabled={ids.length < 2}
          onClick={() => switchCluster(-1)}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="shell-icon-button h-6 w-6 disabled:opacity-30"
          title="Next cluster tab (⌘⇧])"
          aria-label="Next cluster tab"
          disabled={ids.length < 2}
          onClick={() => switchCluster(1)}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      {ids.length === 0 ? (
        <span className="px-2 text-[calc(11px*var(--font-scale))] text-theme-text-tertiary">Catalog</span>
      ) : null}
      {ids.map((id) => {
        const session = sessions[id];
        const cluster = clusters.find((entry) => entry.id === id);
        const active = id === activeClusterId;
        return (
          <div
            key={id}
            className={cn(
              "group/tab relative flex h-7 max-w-[14rem] shrink-0 items-center gap-1 rounded-t border border-b-0 px-2 text-[calc(11px*var(--font-scale))] transition-colors",
              active
                ? "border-theme-border bg-theme-surface text-theme-text-primary"
                : "border-transparent bg-transparent text-theme-text-tertiary hover:bg-theme-hover/60 hover:text-theme-text-secondary",
            )}
          >
            <span
              className={cn(
                "pointer-events-none absolute inset-x-0 top-0 h-0.5 rounded-t",
                active ? "bg-skyhook-500" : "bg-transparent",
              )}
            />
            <button
              type="button"
              className="flex min-w-0 items-center gap-1.5"
              onClick={() => {
                // Clicking the right-pane cluster focuses it and swaps the panes.
                const previous = activeClusterId;
                setActiveCluster(id);
                if (secondaryId === id && previous) setSplitCluster(previous);
              }}
              title={`${cluster?.name ?? id}\n${session.info?.context ?? ""}`}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  session.status === "connected"
                    ? "bg-emerald-500"
                    : session.status === "error"
                      ? "bg-red-500"
                      : "animate-pulse bg-amber-500",
                )}
              />
              <span className="truncate">{cluster?.name ?? session.info?.name ?? id.split("::").pop()}</span>
            </button>
            <button
              type="button"
              className={cn(
                "shrink-0 rounded p-0.5 text-theme-text-tertiary hover:bg-theme-hover hover:text-red-500",
                active ? "opacity-70" : "opacity-0 group-hover/tab:opacity-70",
              )}
              title="Disconnect and close cluster tab (⌘W)"
              onClick={() => void closeTab(id)}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className="shell-icon-button h-6 w-6 shrink-0"
        title="New cluster tab (⌘N)"
        onClick={() => setActiveCluster(null)}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      <Menu
        width={260}
        align="start"
        trigger={({ open, toggle }) => (
          <button
            type="button"
            className={cn(
              "shell-icon-button h-6 w-6 shrink-0",
              (open || secondaryId) && "is-active",
            )}
            title={
              secondaryId
                ? "Split screen: switch or close the second cluster"
                : "Split screen with another cluster"
            }
            aria-label="Split screen"
            onClick={toggle}
          >
            <Rows2 className="h-3.5 w-3.5" />
          </button>
        )}
      >
        {({ close }) => (
          <>
            <MenuLabel>Split screen</MenuLabel>
            {ids.filter((id) => id !== activeClusterId).length === 0 ? (
              <MenuItem disabled>Open another cluster first</MenuItem>
            ) : null}
            {ids
              .filter((id) => id !== activeClusterId)
              .map((id) => {
                const cluster = clusters.find((entry) => entry.id === id);
                const session = sessions[id];
                return (
                  <MenuItem
                    key={id}
                    icon={
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          session?.status === "connected"
                            ? "bg-emerald-500"
                            : session?.status === "error"
                              ? "bg-red-500"
                              : "bg-theme-text-disabled",
                        )}
                      />
                    }
                    shortcut={secondaryId === id ? "✓" : undefined}
                    onClick={() => {
                      setSplitCluster(secondaryId === id ? null : id);
                      close();
                    }}
                  >
                    {cluster?.name ?? id.split("::").pop()}
                  </MenuItem>
                );
              })}
            {secondaryId ? (
              <>
                <MenuSeparator />
                <MenuItem
                  icon={<X className="h-3 w-3" />}
                  danger
                  onClick={() => {
                    setSplitCluster(null);
                    close();
                  }}
                >
                  Close split
                </MenuItem>
              </>
            ) : null}
          </>
        )}
      </Menu>
      {secondaryId ? (
        <span className="flex h-6 max-w-[12rem] shrink-0 items-center gap-1 rounded border border-theme-border bg-theme-surface px-1.5 text-[calc(10px*var(--font-scale))] text-theme-text-tertiary">
          <Rows2 className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {clusters.find((entry) => entry.id === secondaryId)?.name ??
              secondaryId.split("::").pop()}
          </span>
          <button
            type="button"
            className="shrink-0 rounded p-0.5 hover:bg-theme-hover hover:text-theme-text-primary"
            title="Close split"
            onClick={() => setSplitCluster(null)}
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ) : null}
      <div className="ml-auto flex items-center gap-1 pl-2 text-[calc(10px*var(--font-scale))] text-theme-text-disabled">
        <Blocks className="h-3 w-3" />
        {ids.length} open
      </div>
    </div>
  );
}
