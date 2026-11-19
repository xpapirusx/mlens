import { Command, Minus, Moon, Plug, Settings, Square, Sun, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useCatalogStore } from "../stores/catalog-store";
import { cn } from "../lib/cn";
import { Tooltip } from "../design-system/components/Tooltip";
import { api } from "../lib/api";

const isMac = window.mlens.platform === "darwin";

export function TopBar({
  onOpenPalette,
  onOpenPortForwards,
}: {
  onOpenPalette: () => void;
  onOpenPortForwards: () => void;
}) {
  const settings = useCatalogStore((state) => state.settings);
  const updateSettings = useCatalogStore((state) => state.updateSettings);
  const openSettings = useCatalogStore((state) => state.openSettings);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    void api.app.isMaximized().then(setMaximized);
    return api.app.onWindowState(setMaximized);
  }, []);

  const toggleTheme = () => {
    if (!settings) return;
    if ((settings.colorTheme ?? "radar") !== "radar") {
      void updateSettings({ colorTheme: "radar", theme: "light" });
      return;
    }
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
      {/* Обёртка больше НЕ app-no-drag — пустое место вокруг кнопки
          теперь часть drag-региона header'а. */}
      <div className="flex min-w-0 flex-1 justify-center px-2">
        <button
          type="button"
          onClick={onOpenPalette}
          className="app-no-drag flex h-7 w-full max-w-md items-center gap-2 rounded-lg border border-theme-border bg-theme-surface px-2.5 text-left text-[calc(11px*var(--font-scale))] text-theme-text-tertiary transition-colors hover:border-theme-border-light hover:bg-theme-elevated"
        >
          <Command className="h-3.5 w-3.5" />
          <span className="flex-1 truncate">Search clusters, resources and actions…</span>
          <span className="kbd">{isMac ? "⌘K" : "Ctrl K"}</span>
        </button>
      </div>

      <div className="app-no-drag flex shrink-0 items-center gap-0.5">
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