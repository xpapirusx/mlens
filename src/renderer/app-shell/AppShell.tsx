import { useEffect, useRef, useState } from "react";
import { Blocks } from "lucide-react";
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
import { useSessionStore } from "../stores/session-store";
import { Spinner } from "../design-system/components/Spinner";
import { cn } from "../lib/cn";

const EMPTY_RESOURCES: never[] = [];

export function AppShell() {
  const settings = useCatalogStore((state) => state.settings);
  const activeClusterId = useCatalogStore((state) => state.activeClusterId);
  const loadSettings = useCatalogStore((state) => state.loadSettings);
  const loadCatalog = useCatalogStore((state) => state.loadCatalog);
  const openSettings = useCatalogStore((state) => state.openSettings);
  const details = useSessionStore((state) =>
    activeClusterId ? (state.sessions[activeClusterId]?.details ?? null) : null,
  );
  const sessions = useSessionStore((state) => state.sessions);
  const sessionIds = Object.keys(sessions);
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

  useEffect(() => {
    void loadSettings();
    void loadCatalog();
  }, [loadSettings, loadCatalog]);

  // Theme: `.dark` on <html> + color-scheme, following the OS in system mode.
  useEffect(() => {
    if (!settings) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const themeName = settings.colorTheme ?? "radar";
      document.documentElement.classList.toggle("theme-dracula", themeName === "dracula");
      document.documentElement.classList.toggle("theme-freelens", themeName === "freelens");
      document.documentElement.classList.toggle("theme-proton", themeName === "proton");
      const forcedDark = themeName === "dracula" || themeName === "freelens" || themeName === "proton";
      const dark =
        forcedDark ||
        settings.theme === "dark" ||
        (settings.theme === "system" && media.matches);
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
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
      if (event.key === "Escape" && activeClusterId && details) {
        closeDetails(activeClusterId);
      }
      if (mod && event.key.toLowerCase() === "w" && activeClusterId && details) {
        event.preventDefault();
        closeDetails(activeClusterId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    activeClusterId,
    details,
    openSettings,
    openTerminal,
    closeDetails,
    selectKind,
    activeResources,
    paletteOpen,
    shortcutsOpen,
  ]);

  if (!settings) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-theme-base text-theme-text-secondary">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-skyhook-400 to-skyhook-800 text-white shadow-theme-lg">
          <Blocks className="h-6 w-6" />
        </div>
        <div className="text-sm font-semibold text-theme-text-primary">mLens</div>
        <Spinner label="Starting…" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-theme-base text-theme-text-primary">
      <TopBar
        activeClusterId={activeClusterId}
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenPortForwards={() => setForwardsOpen(true)}
      />
      <ClusterTabs />
      <div className="flex min-h-0 flex-1">
        <Hotbar activeClusterId={activeClusterId} />
        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Freelens keeps cluster frames alive when switching. mLens keeps a
              mounted workspace per cluster (hidden with CSS) so table scroll,
              open drawers and terminal PTYs all survive a switch. */}
          {!activeClusterId ? (
            <div className="flex min-h-0 flex-1">
              <CatalogPage />
            </div>
          ) : null}
          {sessionIds.map((id) => (
            <div key={id} className={cn("flex min-h-0 flex-1", id !== activeClusterId && "hidden")}>
              <ClusterWorkspace clusterId={id} active={id === activeClusterId} />
            </div>
          ))}
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
      />
      <ToastViewport />
    </div>
  );
}
