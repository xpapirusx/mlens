import electron from "electron";

const { app } = electron;
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AppSettings, ClusterId } from "@shared/types";

const DEFAULT_KUBECONFIG = path.join(os.homedir(), ".kube", "config");

function envKubeconfigPaths(): string[] {
  const raw = process.env.KUBECONFIG;
  if (!raw) return [];
  return raw
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function defaultSettings(): AppSettings {
  const candidates = [DEFAULT_KUBECONFIG, ...envKubeconfigPaths()];
  const kubeconfigPaths = [...new Set(candidates)].filter((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  });

  return {
    theme: "dark",
    colorTheme: "radar",
    kubeconfigPaths,
    favorites: [],
    recentClusters: [],
    refreshIntervalSeconds: 60,
    terminalFontSize: 13,
    terminalFontFamily: "DM Mono",
    confirmBeforeDelete: true,
    showSystemNamespaces: false,
    sidebarWidth: 236,
    dockHeight: 340,
    tableRowHeight: 44,
    collapseCatalogGroups: true,
    favoriteKinds: [],
    hiddenClusters: [],
    hotbarOrder: [],
    sidebarGroupOrder: [],
    tableColumnWidths: {},
    tableColumnOrder: {},
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitize(input: Partial<AppSettings>): Partial<AppSettings> {
  const out: Partial<AppSettings> = { ...input };
  if (out.theme && !["light", "dark", "system"].includes(out.theme)) delete out.theme;
  if (out.colorTheme && !["radar", "dracula", "freelens"].includes(out.colorTheme)) delete out.colorTheme;
  if (out.kubeconfigPaths) {
    out.kubeconfigPaths = [...new Set(out.kubeconfigPaths.filter((entry) => typeof entry === "string"))];
  }
  if (out.favorites) out.favorites = [...new Set(out.favorites)] as ClusterId[];
  if (out.recentClusters) {
    out.recentClusters = out.recentClusters
      .filter((entry) => entry && typeof entry.id === "string" && typeof entry.openedAt === "number")
      .slice(0, 20);
  }
  if (typeof out.refreshIntervalSeconds === "number") {
    out.refreshIntervalSeconds = clamp(Math.round(out.refreshIntervalSeconds), 0, 300);
  }
  if (typeof out.terminalFontSize === "number") {
    out.terminalFontSize = clamp(Math.round(out.terminalFontSize), 9, 22);
  }
  if (typeof out.sidebarWidth === "number") {
    out.sidebarWidth = clamp(Math.round(out.sidebarWidth), 170, 420);
  }
  if (typeof out.dockHeight === "number") {
    out.dockHeight = clamp(Math.round(out.dockHeight), 160, 900);
  }
  if (typeof out.tableRowHeight === "number") {
    out.tableRowHeight = [24, 28, 30, 32, 36, 40, 44, 48, 52].includes(Math.round(out.tableRowHeight))
      ? Math.round(out.tableRowHeight)
      : 44;
  }
  if (out.favoriteKinds) {
    out.favoriteKinds = [...new Set(out.favoriteKinds.filter((entry) => typeof entry === "string"))];
  }
  if (out.hiddenClusters) {
    out.hiddenClusters = [...new Set(out.hiddenClusters.filter((entry) => typeof entry === "string"))] as ClusterId[];
  }
  if (out.hotbarOrder) {
    out.hotbarOrder = [...new Set(out.hotbarOrder.filter((entry) => typeof entry === "string"))] as ClusterId[];
  }
  if (out.sidebarGroupOrder) {
    out.sidebarGroupOrder = out.sidebarGroupOrder.filter((entry) => typeof entry === "string");
  }
  if (out.tableColumnWidths) {
    out.tableColumnWidths = Object.fromEntries(
      Object.entries(out.tableColumnWidths)
        .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
        .map(([key, value]) => [key, clamp(Math.round(value), 60, 1200)]),
    );
  }
  if (out.tableColumnOrder) {
    out.tableColumnOrder = Object.fromEntries(
      Object.entries(out.tableColumnOrder).filter(([, value]) => Array.isArray(value)),
    );
  }
  return out;
}

export class SettingsStore {
  private readonly file: string;
  private state: AppSettings;
  private listeners = new Set<(settings: AppSettings) => void>();

  constructor() {
    this.file = path.join(app.getPath("userData"), "settings.json");
    this.state = this.load();
  }

  private load(): AppSettings {
    const defaults = defaultSettings();
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8")) as Partial<AppSettings>;
      return { ...defaults, ...sanitize(raw) };
    } catch {
      return defaults;
    }
  }

  private persist(): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.state, null, 2), { mode: 0o600 });
    } catch (error) {
      console.error("[settings] failed to persist", error);
    }
  }

  get(): AppSettings {
    // Return a copy so callers can't mutate the store by accident.
    return { ...this.state, favorites: [...this.state.favorites], recentClusters: [...this.state.recentClusters] };
  }

  update(patch: Partial<AppSettings>): AppSettings {
    this.state = { ...this.state, ...sanitize(patch) };
    this.persist();
    const next = this.get();
    for (const listener of this.listeners) listener(next);
    return next;
  }

  onChange(listener: (settings: AppSettings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  addRecentCluster(id: ClusterId): void {
    const recent = this.state.recentClusters.filter((entry) => entry.id !== id);
    recent.unshift({ id, openedAt: Date.now() });
    this.update({ recentClusters: recent.slice(0, 12) });
  }
}
