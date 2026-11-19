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
    catalogSort: "status",
    portForwardOpenBrowser: true,
    refreshIntervalSeconds: 60,
    terminalFontSize: 13,
    terminalFontFamily: "DM Mono",
    confirmBeforeDelete: true,
    showSystemNamespaces: false,
    sidebarWidth: 236,
    dockHeight: 340,
    tableRowHeight: 44,
    fontScale: 1,
    uiFontFamily: "DM Sans",
    editorFontFamily: "DM Mono",
    editorFontSize: 12,
    editorLineNumbers: true,
    editorMinimap: false,
    editorTabSize: 2,
    terminalCopyOnSelect: false,
    timeZone: "local",
    collapseCatalogGroups: true,
    favoriteKinds: [],
    hiddenClusters: [],
    hotbarOrder: [],
    hotbarSlots: [],
    hotbarPages: [[]],
    hotbarPageIndex: 0,
    annotationPresets: {
      iReallyWantDeleteThis: "true",
      "cluster.x-k8s.io/delete-machine": "true",
    },
    labelPresets: {},
    sidebarGroupOrder: [],
    tableColumnWidths: {},
    tableColumnOrder: {},
    tableSorts: {},
  };
}

const MONO_FONT_FAMILIES = [
  "DM Mono",
  "Ubuntu Mono",
  "JetBrains Mono",
  "Fira Code",
  "Source Code Pro",
  "Menlo",
  "Monaco",
  "SFMono-Regular",
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitize(input: Partial<AppSettings>): Partial<AppSettings> {
  const out: Partial<AppSettings> = { ...input };
  if (out.theme && !["light", "dark", "system"].includes(out.theme)) delete out.theme;
  if (
    out.colorTheme &&
    ![
      "radar",
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
    ].includes(out.colorTheme)
  ) {
    delete out.colorTheme;
  }
  if (out.kubeconfigPaths) {
    out.kubeconfigPaths = [...new Set(out.kubeconfigPaths.filter((entry) => typeof entry === "string"))];
  }
  if (out.favorites) out.favorites = [...new Set(out.favorites)] as ClusterId[];
  if (out.recentClusters) {
    out.recentClusters = out.recentClusters
      .filter((entry) => entry && typeof entry.id === "string" && typeof entry.openedAt === "number")
      .slice(0, 20);
  }
  if (out.catalogSort && !["status", "name", "recent", "source"].includes(out.catalogSort)) {
    delete out.catalogSort;
  }
  if (typeof out.portForwardOpenBrowser !== "boolean") delete out.portForwardOpenBrowser;
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
  if (typeof out.fontScale === "number") {
    out.fontScale = clamp(Math.round(out.fontScale * 100) / 100, 0.5, 2);
  }
  if (
    out.uiFontFamily &&
    !["DM Sans", "Ubuntu", "Tinos", "System UI", "DM Mono", "Ubuntu Mono", "JetBrains Mono", "Fira Code", "Source Code Pro"].includes(
      out.uiFontFamily,
    )
  ) {
    delete out.uiFontFamily;
  }
  if (
    out.editorFontFamily &&
    !MONO_FONT_FAMILIES.includes(out.editorFontFamily)
  ) {
    delete out.editorFontFamily;
  }
  if (out.terminalFontFamily && !MONO_FONT_FAMILIES.includes(out.terminalFontFamily)) {
    delete out.terminalFontFamily;
  }
  if (typeof out.editorFontSize === "number") {
    out.editorFontSize = clamp(Math.round(out.editorFontSize), 8, 24);
  }
  if (typeof out.editorTabSize === "number") {
    out.editorTabSize = clamp(Math.round(out.editorTabSize), 1, 8);
  }
  if (typeof out.editorLineNumbers !== "boolean") delete out.editorLineNumbers;
  if (typeof out.editorMinimap !== "boolean") delete out.editorMinimap;
  if (typeof out.terminalCopyOnSelect !== "boolean") delete out.terminalCopyOnSelect;
  if (out.timeZone && !["local", "utc"].includes(out.timeZone)) delete out.timeZone;
  if (out.favoriteKinds) {
    out.favoriteKinds = [...new Set(out.favoriteKinds.filter((entry) => typeof entry === "string"))];
  }
  if (out.hiddenClusters) {
    out.hiddenClusters = [...new Set(out.hiddenClusters.filter((entry) => typeof entry === "string"))] as ClusterId[];
  }
  if (out.hotbarOrder) {
    out.hotbarOrder = [...new Set(out.hotbarOrder.filter((entry) => typeof entry === "string"))] as ClusterId[];
  }
  if (out.hotbarSlots) {
    out.hotbarSlots = out.hotbarSlots
      .slice(0, 10)
      .map((entry) => (typeof entry === "string" ? entry : null));
  }
  if (out.hotbarPages) {
    out.hotbarPages = (Array.isArray(out.hotbarPages) ? out.hotbarPages : [])
      .slice(0, 12)
      .filter((page) => Array.isArray(page))
      .map((page) => page.slice(0, 10).map((entry) => (typeof entry === "string" ? entry : null)));
    if (out.hotbarPages.length === 0) out.hotbarPages = [[]];
  }
  if (typeof out.hotbarPageIndex === "number" && Number.isFinite(out.hotbarPageIndex)) {
    out.hotbarPageIndex = Math.max(0, Math.round(out.hotbarPageIndex));
  } else if (out.hotbarPageIndex !== undefined) {
    delete out.hotbarPageIndex;
  }
  for (const field of ["annotationPresets", "labelPresets"] as const) {
    if (out[field]) {
      out[field] = Object.fromEntries(
        Object.entries(out[field]).filter(
          ([key, value]) => typeof key === "string" && key.length > 0 && typeof value === "string",
        ),
      );
    }
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
  if (out.tableSorts) {
    out.tableSorts = Object.fromEntries(
      Object.entries(out.tableSorts).filter(
        ([, value]) =>
          value &&
          typeof value === "object" &&
          typeof value.key === "string" &&
          value.key.length > 0 &&
          (value.direction === "asc" || value.direction === "desc"),
      ),
    );
  }
  return out;
}

export class SettingsStore {
  private readonly file: string;
  private state: AppSettings;
  private listeners = new Set<(settings: AppSettings) => void>();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  constructor() {
    this.file = path.join(app.getPath("userData"), "settings.json");
    this.state = this.load();
  }

  private load(): AppSettings {
    const defaults = defaultSettings();
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8")) as Partial<AppSettings>;
      const state = { ...defaults, ...sanitize(raw) };
      // Migration: settings written before hotbar pages existed carry a single
      // `hotbarSlots` array — it becomes page one.
      if (!state.hotbarPages.some((page) => page.some(Boolean)) && state.hotbarSlots.length > 0) {
        state.hotbarPages = [state.hotbarSlots.slice(0, 10)];
      }
      if (state.hotbarPages.length === 0) state.hotbarPages = [[]];
      state.hotbarPageIndex = Math.min(
        Math.max(0, state.hotbarPageIndex),
        state.hotbarPages.length - 1,
      );
      return state;
    } catch {
      return defaults;
    }
  }

  /**
   * A9: coalesce writes. Every update used to pretty-print and write the whole
   * file synchronously on the main thread — and some paths (font scale, other
   * settings inputs) call `update` per input event. The in-memory state stays
   * synchronous; the disk write is debounced and `flush()`ed on quit.
   */
  private persist(): void {
    this.dirty = true;
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.writeNow();
    }, 250);
  }

  /** Synchronous write of any pending change — call before the app quits. */
  flush(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (!this.dirty) return;
    this.writeNow();
  }

  private writeNow(): void {
    this.dirty = false;
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
    const next = { ...this.state, ...sanitize(patch) };
    // Hotbar pages are authoritative; `hotbarSlots` mirrors the visible page
    // so older readers (and the docs) keep working.
    if (next.hotbarPages.length > 0) {
      next.hotbarPageIndex = Math.min(Math.max(0, next.hotbarPageIndex), next.hotbarPages.length - 1);
      next.hotbarSlots = [...next.hotbarPages[next.hotbarPageIndex]];
    }
    this.state = next;
    this.persist();
    const value = this.get();
    for (const listener of this.listeners) listener(value);
    return value;
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
