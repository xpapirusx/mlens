import {
  ArrowLeft,
  ArrowRight,
  Command,
  Home,
  Minus,
  Moon,
  Plug,
  Settings,
  Square,
  SquareTerminal,
  Sun,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useCatalogStore } from "../stores/catalog-store";
import { useSessionStore } from "../stores/session-store";
import { cn } from "../lib/cn";
import { Tooltip } from "../design-system/components/Tooltip";
import { api } from "../lib/api";

const isMac = window.mlens.platform === "darwin";

export function TopBar({
  activeClusterId,
  onOpenPalette,
  onOpenPortForwards,
}: {
  activeClusterId: string | null;
  onOpenPalette: () => void;
  onOpenPortForwards: () => void;
}) {
  const settings = useCatalogStore((state) => state.settings);
  const updateSettings = useCatalogStore((state) => state.updateSettings);
  const setActiveCluster = useCatalogStore((state) => state.setActiveCluster);
  const openSettings = useCatalogStore((state) => state.openSettings);
  const clusters = useCatalogStore((state) => state.clusters);
  const health = useCatalogStore((state) => state.health);
  const session = useSessionStore((state) => (activeClusterId ? state.sessions[activeClusterId] : undefined));
  const detailsBack = useSessionStore((state) => state.detailsBack);
  const closeDetails = useSessionStore((state) => state.closeDetails);
  const details = session?.details ?? null;
  const detailsHistory = session?.detailsHistory ?? [];
  const openTerminal = useSessionStore((state) => state.openTerminal);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    void api.app.isMaximized().then(setMaximized);
    return api.app.onWindowState(setMaximized);
  }, []);

  const activeCluster = clusters.find((cluster) => cluster.id === activeClusterId);
  const clusterHealth = activeClusterId ? health[activeClusterId] : undefined;

  const goBack = () => {
    if (activeClusterId && details) {
      if (detailsHistory.length > 0) detailsBack(activeClusterId);
      else closeDetails(activeClusterId);
      return;
    }
    if (activeClusterId) setActiveCluster(null);
  };

  const toggleTheme = () => {
    if (!settings) return;
    const next = settings.theme === "dark" ? "light" : "dark";
    void updateSettings({ theme: next });
  };

  return (
    <header
      className={cn(
        "app-drag relative z-40 flex h-11 shrink-0 items-center gap-1.5 border-b border-theme-border bg-theme-base",
        isMac && "pl-[84px]",
        !isMac && "pl-2",
        "pr-2",
      )}
      onDoubleClick={() => {
        if (!isMac) void api.app.maximize();
      }}
    >
      <div className="app-no-drag flex shrink-0 items-center gap-0.5">
        <Tooltip content="Catalog (home)">
          <button type="button" className="shell-icon-button" onClick={() => setActiveCluster(null)} title="Catalog (home)" aria-label="Catalog">
            <Home className="h-4 w-4" />
          </button>
        </Tooltip>
        <Tooltip content={details ? "Back to previous resource" : "Back to catalog"}>
          <button
            type="button"
            className="shell-icon-button"
            onClick={goBack}
            disabled={!activeClusterId}
            title={details ? "Back to previous resource" : "Back to catalog"}
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        </Tooltip>
        <Tooltip content="Forward navigation is not implemented (no route history yet)">
          <button type="button" className="shell-icon-button" disabled title="Forward navigation is not implemented yet" aria-label="Forward">
            <ArrowRight className="h-4 w-4" />
          </button>
        </Tooltip>
      </div>

      {activeCluster ? (
        <div className="app-no-drag ml-1 flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              clusterHealth?.status === "connected" || session?.status === "connected"
                ? "bg-emerald-500"
                : clusterHealth?.status === "error"
                  ? "bg-red-500"
                  : "bg-amber-500",
            )}
          />
          <span className="max-w-[14rem] truncate text-[12px] font-medium text-theme-text-primary">
            {activeCluster.name}
          </span>
          {session?.info ? (
            <span className="hidden rounded bg-theme-elevated px-1.5 py-0.5 font-mono text-[10px] text-theme-text-tertiary md:inline">
              v{session.info.version}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="app-no-drag flex min-w-0 flex-1 justify-center px-2">
        <button
          type="button"
          onClick={onOpenPalette}
          className="flex h-7 w-full max-w-md items-center gap-2 rounded-lg border border-theme-border bg-theme-surface px-2.5 text-left text-[11px] text-theme-text-tertiary transition-colors hover:border-theme-border-light hover:bg-theme-elevated"
        >
          <Command className="h-3.5 w-3.5" />
          <span className="flex-1 truncate">Search clusters, resources and actions…</span>
          <span className="kbd">{isMac ? "⌘K" : "Ctrl K"}</span>
        </button>
      </div>

      <div className="app-no-drag flex shrink-0 items-center gap-0.5">
        {activeClusterId ? (
          <Tooltip content="Port forwards">
            <button
              type="button"
              className="shell-icon-button"
              onClick={onOpenPortForwards}
              title="Port forwards"
              aria-label="Port forwards"
            >
              <Plug className="h-4 w-4" />
            </button>
          </Tooltip>
        ) : null}
        {activeClusterId ? (
          <Tooltip content="New terminal">
            <button
              type="button"
              className="shell-icon-button"
              onClick={() => openTerminal(activeClusterId, { type: "local" })}
              title="New terminal"
              aria-label="New terminal"
            >
              <SquareTerminal className="h-4 w-4" />
            </button>
          </Tooltip>
        ) : null}
        <Tooltip content={settings?.theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
          <button type="button" className="shell-icon-button" onClick={toggleTheme} title="Toggle theme" aria-label="Toggle theme">
            {settings?.theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </Tooltip>
        <Tooltip content="Settings">
          <button type="button" className="shell-icon-button" onClick={() => openSettings(true)} title="Settings" aria-label="Settings">
            <Settings className="h-4 w-4" />
          </button>
        </Tooltip>

        {!isMac ? (
          <div className="ml-1 flex items-center">
            <button
              type="button"
              className="flex h-8 w-9 items-center justify-center text-theme-text-secondary hover:bg-theme-hover"
              onClick={() => void api.app.minimize()}
              aria-label="Minimize window"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="flex h-8 w-9 items-center justify-center text-theme-text-secondary hover:bg-theme-hover"
              onClick={() => void api.app.maximize()}
              aria-label={maximized ? "Restore window" : "Maximize window"}
            >
              <Square className={cn("h-3 w-3", maximized && "opacity-60")} />
            </button>
            <button
              type="button"
              className="flex h-8 w-9 items-center justify-center text-theme-text-secondary hover:bg-red-500 hover:text-white"
              onClick={() => void api.app.close()}
              aria-label="Close window"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
