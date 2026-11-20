import { useEffect, useRef, useState } from "react";
import { TopBar } from "./TopBar";
import { ClusterTabs } from "./ClusterTabs";
import { Hotbar } from "./Hotbar";
import { StatusBar } from "./StatusBar";
import { CommandPalette } from "./CommandPalette";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { ClusterWorkspace } from "./ClusterWorkspace";
import { CatalogPage } from "../features/catalog/CatalogPage";
import { SettingsDialog } from "../features/settings/SettingsDialog";
import { PortForwardsPanel } from "../features/port-forward/PortForwardDialog";
import { ToastViewport } from "../design-system/components/Toast";
import { useCatalogStore } from "../stores/catalog-store";
import { hasEditorTab, useSessionStore, useChromeSessions, activePaneOf, sameRef } from "../stores/session-store";
import { closeClusterTab } from "../lib/cluster-actions";
import { Spinner } from "../design-system/components/Spinner";
import { MlensLogo } from "../design-system/components/MlensLogo";
import { cn } from "../lib/cn";
import { uiFontStack } from "../lib/fonts";
import { setTimeZonePreference } from "../lib/format";

const EMPTY_RESOURCES: never[] = [];

export function AppShell() {
  const settings = useCatalogStore((state) => state.settings);
  const activeClusterId = useCatalogStore((state) => state.activeClusterId);
  const loadSettings = useCatalogStore((state) => state.loadSettings);
  const loadCatalog = useCatalogStore((state) => state.loadCatalog);
  const openSettings = useCatalogStore((state) => state.openSettings);
  const updateSettings = useCatalogStore((state) => state.updateSettings);
  const splitClusterId = useCatalogStore((state) => state.splitClusterId);
  const splitDirection = useCatalogStore((state) => state.splitDirection);
  const splitRatio = useCatalogStore((state) => state.splitRatio);
  const setSplitRatio = useCatalogStore((state) => state.setSplitRatio);
  const setActiveCluster = useCatalogStore((state) => state.setActiveCluster);
  const hasTab = useSessionStore((state) =>
    activeClusterId ? hasEditorTab(state.sessions[activeClusterId]) : false,
  );
  const sessions = useChromeSessions();
  const sessionIds = Object.keys(sessions);
  // The right-hand pane only exists while both clusters have live sessions.
  const secondaryId =
    activeClusterId && splitClusterId && splitClusterId !== activeClusterId && sessionIds.includes(splitClusterId)
      ? splitClusterId
      : null;
  const closeDetails = useSessionStore((state) => state.closeDetails);
  const openTerminal = useSessionStore((state) => state.openTerminal);
  const selectKind = useSessionStore((state) => state.selectKind);
  const activeResources = useSessionStore(
    (state) => (activeClusterId ? state.sessions[activeClusterId]?.resources : undefined) ?? EMPTY_RESOURCES,
  );

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [forwardsOpen, setForwardsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const lastG = useRef(0);

  // Cross-cluster split: local `ratio` while dragging, committed on pointerup.
  const [splitResizing, setSplitResizing] = useState(false);
  const [ratio, setRatio] = useState(splitRatio);
  const ratioRef = useRef(ratio);
  const mainRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    ratioRef.current = splitRatio;
    setRatio(splitRatio);
  }, [splitRatio]);

  useEffect(() => {
    if (!splitResizing) return;
    const onMove = (event: PointerEvent) => {
      const rect = mainRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) return;
      const next =
        splitDirection === "right"
          ? (event.clientX - rect.left) / rect.width
          : (event.clientY - rect.top) / rect.height;
      const clamped = Math.min(0.8, Math.max(0.2, next));
      ratioRef.current = clamped;
      setRatio(clamped);
    };
    const onUp = () => {
      setSplitResizing(false);
      setSplitRatio(ratioRef.current);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [splitResizing, splitDirection, setSplitRatio]);

  useEffect(() => {
    void loadSettings();
    void loadCatalog();
  }, [loadSettings, loadCatalog]);

  // ⌘⇧B toggles the editor area. Capture phase so it also fires while Monaco,
  // a log viewer, or the terminal owns the keyboard, and independent of the
  // larger navigation handler below.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey) return;
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) return;
      if (event.code !== "KeyB" && event.key.toLowerCase() !== "b") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (activeClusterId) useSessionStore.getState().toggleDetails(activeClusterId);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [activeClusterId]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      // Keep the editor open while interacting with itself, the restore tray,
      // a resource row (which opens a resource instead), dialogs and menus.
      if (
        !target ||
        target.closest("[data-editor-area], [data-editor-tray], [data-resource-row], [role='dialog'], .menu-surface")
      ) {
        return;
      }
      if (!activeClusterId) return;
      const store = useSessionStore.getState();
      const session = store.sessions[activeClusterId];
      if (!session || session.editor.minimized || !hasEditorTab(session)) return;
      store.minimizeDetails(activeClusterId);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [activeClusterId]);

  // Theme: `.dark` on <html> + color-scheme, following the OS in system mode.
  useEffect(() => {
    if (!settings) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const themeName = settings.colorTheme ?? "radar";
      const themed = [
        "dracula",
        "freelens",
        "proton",
        "synthwave",
        "islands",
        "github",
        "night-owl",
        "material",
        "one-dark-pro",
        "one-dark",
        "catppuccin",
        "jellybeans",
        "adwaita",
        "copilot",
        "min",
        "aura",
        "slack",
        "bluloco",
        "github-light",
        "om",
        "vim",
        "white",
      ] as const;
      for (const name of themed) {
        document.documentElement.classList.toggle(`theme-${name}`, themeName === name);
      }
      const forcedLight = themeName === "github-light" || themeName === "white";
      const forcedDark = themeName !== "radar" && !forcedLight;
      const dark =
        !forcedLight &&
        (forcedDark ||
          settings.theme === "dark" ||
          (settings.theme === "system" && media.matches));
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
      // CSS var consumed by the font-size calc()s; spacing stays rem-anchored and unscaled.
      document.documentElement.style.setProperty("--font-scale", String(settings.fontScale ?? 1));
      // UI family: Ubuntu/DM Sans/System UI. Tailwind's --font-sans var is
      // defined on :root, so an inline property on <html> wins.
      document.documentElement.style.setProperty("--font-sans", uiFontStack(settings.uiFontFamily));
      setTimeZonePreference(settings.timeZone);
    };
    apply();
    if (settings.theme !== "system") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [settings]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (mod && event.key === ",") {
        event.preventDefault();
        openSettings(true);
        return;
      }
      if (mod && !event.shiftKey && event.key.toLowerCase() === "n") {
        // VS Code-style "new tab": open the catalog to pick another cluster
        // (the current cluster stays open in its tab).
        event.preventDefault();
        setActiveCluster(null);
        return;
      }
      if (mod && !event.shiftKey && event.key.toLowerCase() === "b") {
        // VS Code-style sidebar toggle; shared by the catalog page and every
        // cluster's resource catalog.
        event.preventDefault();
        const collapsed = useCatalogStore.getState().settings?.sidebarCollapsed ?? false;
        void updateSettings({ sidebarCollapsed: !collapsed });
        return;
      }
      // Cluster tabs: ⌘⇧] / ⌘⇧[ (and Ctrl+Shift+]) like a browser. `event.key`
      // is `}` when Shift is held, so match the physical bracket keys.
      if (mod && event.shiftKey && (event.code === "BracketRight" || event.code === "BracketLeft")) {
        const ids = Object.keys(useSessionStore.getState().sessions);
        if (ids.length > 1) {
          event.preventDefault();
          const at = activeClusterId ? ids.indexOf(activeClusterId) : -1;
          const delta = event.code === "BracketRight" ? 1 : -1;
          const next = ids[(at + delta + ids.length) % ids.length];
          if (next) setActiveCluster(next);
        }
        return;
      }
      // Ctrl+Tab / Ctrl+Shift+Tab cycles the focused editor pane's tabs.
      if (event.ctrlKey && !event.metaKey && event.key === "Tab" && activeClusterId) {
        event.preventDefault();
        const session = useSessionStore.getState().sessions[activeClusterId];
        const pane = activePaneOf(session);
        if (pane && pane.tabs.length > 1 && pane.active) {
          const at = pane.tabs.findIndex((tab) => sameRef(tab, pane.active!));
          const delta = event.shiftKey ? -1 : 1;
          const next = pane.tabs[(at + delta + pane.tabs.length) % pane.tabs.length];
          if (next) useSessionStore.getState().activateResource(activeClusterId, next);
        }
        return;
      }
      if (mod && !event.shiftKey && event.key.toLowerCase() === "t" && activeClusterId) {
        event.preventDefault();
        openTerminal(activeClusterId, { type: "local" });
        return;
      }
      if (!mod && !typing && (paletteOpen || shortcutsOpen)) return;
      if (!mod && !typing && event.key === "?") {
        event.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (!mod && !typing && event.key.toLowerCase() === "g") {
        lastG.current = Date.now();
        return;
      }
      if (!mod && !typing && Date.now() - lastG.current < 1200 && activeClusterId) {
        const letter = event.key.toLowerCase();
        const kindByLetter: Record<string, string> = {
          p: "Pod",
          d: "Deployment",
          s: "Service",
          j: "Job",
          c: "ConfigMap",
          n: "Node",
          x: "Secret",
          i: "Ingress",
        };
        if (letter === "o") {
          event.preventDefault();
          lastG.current = 0;
          selectKind(activeClusterId, { apiVersion: "", kind: "__overview__" });
          return;
        }
        const kind = kindByLetter[letter];
        const resource = kind ? activeResources.find((entry) => entry.kind === kind) : undefined;
        if (resource) {
          event.preventDefault();
          lastG.current = 0;
          selectKind(activeClusterId, { apiVersion: resource.apiVersion, kind: resource.kind });
          return;
        }
      }
      if (event.key === "Escape" && activeClusterId && hasTab) {
        closeDetails(activeClusterId);
      }
      if (mod && event.key.toLowerCase() === "w") {
        // ⌘W closes the active editor tab, then the active cluster tab — it
        // must never close the whole window. A focused terminal keeps its own
        // Ctrl+W (readline "delete word") on Windows/Linux.
        if (target?.closest?.(".xterm")) return;
        event.preventDefault();
        if (activeClusterId && hasTab) closeDetails(activeClusterId);
        else if (activeClusterId) void closeClusterTab(activeClusterId);
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    activeClusterId,
    hasTab,
    openSettings,
    openTerminal,
    closeDetails,
    selectKind,
    activeResources,
    paletteOpen,
    shortcutsOpen,
    setActiveCluster,
    updateSettings,
  ]);

  if (!settings) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-theme-base text-theme-text-secondary">
        <MlensLogo className="h-12 w-12 shadow-theme-lg" />
        <div className="text-sm font-semibold text-theme-text-primary">mLens</div>
        <Spinner label="Starting…" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-theme-base text-theme-text-primary">
      <TopBar
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenPortForwards={() => setForwardsOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />
      <ClusterTabs />
      <div className="flex min-h-0 flex-1">
        <Hotbar activeClusterId={activeClusterId} />
        <main
          ref={mainRef}
          className={cn(
            "relative flex min-h-0 min-w-0 flex-1 overflow-hidden",
            secondaryId && splitDirection === "right" ? "flex-row" : "flex-col",
          )}
        >
          {/* Freelens keeps cluster frames alive when switching. mLens keeps a
              mounted workspace per cluster (hidden with CSS) so table scroll,
              open drawers and terminal PTYs all survive a switch. A split can
              place the active cluster beside the chosen one (right) or above
              it (down), like the editor area's split actions; every other
              workspace stays mounted but hidden. */}
          {!activeClusterId ? (
            <div className="flex min-h-0 flex-1">
              <CatalogPage />
            </div>
          ) : null}
          {sessionIds.map((id) => {
            const isPrimary = id === activeClusterId;
            const isSecondary = id === secondaryId;
            const visible = isPrimary || isSecondary;
            return (
              <div
                key={id}
                className={cn(
                  "flex min-h-0 min-w-0",
                  !visible && "hidden",
                  visible && !secondaryId && "flex-1",
                  isSecondary && (splitDirection === "right" ? "border-l border-theme-border" : "border-t border-theme-border"),
                )}
                style={
                  visible && secondaryId
                    ? {
                        flexGrow: isPrimary ? ratio : 1 - ratio,
                        flexBasis: 0,
                        order: isPrimary ? 0 : 1,
                      }
                    : undefined
                }
              >
                <ClusterWorkspace clusterId={id} active={visible} />
              </div>
            );
          })}
          {secondaryId ? (
            splitDirection === "right" ? (
              <div
                role="separator"
                aria-orientation="vertical"
                title="Resize the split"
                className={cn(
                  "absolute inset-y-0 z-40 w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-skyhook-500/40",
                  splitResizing && "bg-skyhook-500/40",
                )}
                style={{ left: `${ratio * 100}%` }}
                onPointerDown={(event) => {
                  event.preventDefault();
                  setSplitResizing(true);
                }}
              />
            ) : (
              <div
                role="separator"
                aria-orientation="horizontal"
                title="Resize the split"
                className={cn(
                  "absolute inset-x-0 z-40 h-1.5 -translate-y-1/2 cursor-row-resize hover:bg-skyhook-500/40",
                  splitResizing && "bg-skyhook-500/40",
                )}
                style={{ top: `${ratio * 100}%` }}
                onPointerDown={(event) => {
                  event.preventDefault();
                  setSplitResizing(true);
                }}
              />
            )
          ) : null}
        </main>
      </div>
      <StatusBar activeClusterId={activeClusterId} />
      <SettingsDialog />
      <PortForwardsPanel open={forwardsOpen} onClose={() => setForwardsOpen(false)} />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        activeClusterId={activeClusterId}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />
      <ToastViewport />
    </div>
  );
}
