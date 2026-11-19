import { create } from "zustand";
import type { AppSettings, ClusterHealth, ClusterId, ClusterSummary, KubeconfigSource, ResourceKey } from "@shared/types";
import { api, call, errorText } from "../lib/api";
import { toast } from "../design-system/components/Toast";
import { useSessionStore } from "./session-store";

interface CatalogStore {
  settings: AppSettings | null;
  settingsOpen: boolean;
  sources: KubeconfigSource[];
  allClusters: ClusterSummary[];
  clusters: ClusterSummary[];
  health: Record<ClusterId, ClusterHealth>;
  activeClusterId: ClusterId | null;
  loadingCatalog: boolean;
  catalogError: string | null;
  connecting: Record<ClusterId, boolean>;
  /**
   * Resource pinned with "Select for comparison" (VS Code-style). Global on
   * purpose: the other side usually lives in a different cluster, so the pair
   * must survive cluster switches.
   */
  compareSelection: ResourceKey | null;
  setCompareSelection: (selection: ResourceKey | null) => void;
  /** Secondary cluster shown to the right of the active one (screen split). */
  splitClusterId: ClusterId | null;
  /** Fraction of the main area given to the primary workspace (0.2–0.8). */
  splitRatio: number;
  setSplitCluster: (id: ClusterId | null) => void;
  setSplitRatio: (ratio: number) => void;
  loadSettings: () => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  loadCatalog: () => Promise<void>;
  setHiddenClusters: (ids: ClusterId[]) => Promise<void>;
  connect: (id: ClusterId) => Promise<boolean>;
  disconnect: (id: ClusterId) => Promise<void>;
  removeKubeconfig: (path: string) => Promise<void>;
  importViaDialog: () => Promise<string[]>;
  toggleFavorite: (id: ClusterId) => Promise<void>;
  setActiveCluster: (id: ClusterId | null) => void;
  openSettings: (open: boolean) => void;
  checkHealth: (id: ClusterId) => Promise<void>;
  noteOpened: (id: ClusterId) => Promise<void>;
}

export const useCatalogStore = create<CatalogStore>((set, get) => ({
  settings: null,
  settingsOpen: false,
  sources: [],
  allClusters: [],
  clusters: [],
  health: {},
  activeClusterId: null,
  loadingCatalog: false,
  catalogError: null,
  connecting: {},

  compareSelection: null,
  setCompareSelection: (selection) => set({ compareSelection: selection }),
  splitClusterId: null,
  splitRatio: 0.5,
  setSplitCluster: (id) =>
    set((state) => ({
      splitClusterId: id && id === state.activeClusterId ? null : id,
    })),
  setSplitRatio: (ratio) => set({ splitRatio: Math.min(0.8, Math.max(0.2, ratio)) }),

  loadSettings: async () => {
    try {
      const settings = await call(api.settings.get());
      set({ settings });
    } catch (error) {
      toast.error("Cannot load settings", errorText(error));
    }
  },

  updateSettings: async (patch) => {
    try {
      const settings = await call(api.settings.update(patch));
      const hidden = new Set(settings.hiddenClusters);
      set((state) => ({
        settings,
        clusters: state.allClusters.filter((cluster) => !hidden.has(cluster.id)),
      }));
    } catch (error) {
      toast.error("Cannot save settings", errorText(error));
    }
  },

  setHiddenClusters: async (ids) => {
    const previous = new Set(get().settings?.hiddenClusters ?? []);
    const newlyHidden = ids.filter((id) => !previous.has(id));
    for (const id of newlyHidden) {
      if (useSessionStore.getState().sessions[id]) {
        await get().disconnect(id);
        useSessionStore.getState().dispose(id);
      }
    }
    if (get().activeClusterId && ids.includes(get().activeClusterId!)) set({ activeClusterId: null });
    await get().updateSettings({ hiddenClusters: ids });
  },

  loadCatalog: async () => {
    set({ loadingCatalog: true, catalogError: null });
    try {
      const result = await call(api.clusters.listKubeconfigs());
      const settings = get().settings ?? (await call(api.settings.get()));
      const hidden = new Set(settings.hiddenClusters);
      set({
        sources: result.sources,
        allClusters: result.clusters,
        clusters: result.clusters.filter((cluster) => !hidden.has(cluster.id)),
        settings,
        loadingCatalog: false,
      });
    } catch (error) {
      set({ loadingCatalog: false, catalogError: errorText(error) });
    }
  },

  connect: async (id) => {
    set((state) => ({ connecting: { ...state.connecting, [id]: true } }));
    try {
      const info = await call(api.clusters.connect(id));
      set((state) => ({
        activeClusterId: id,
        connecting: { ...state.connecting, [id]: false },
        health: { ...state.health, [id]: { id, status: "connected", checkedAt: Date.now(), latencyMs: 0 } },
      }));
      await get().noteOpened(id);
      // Discovery is part of opening a cluster session; surface failures in the session UI.
      return Boolean(info);
    } catch (error) {
      set((state) => ({
        connecting: { ...state.connecting, [id]: false },
        health: { ...state.health, [id]: { id, status: "error", error: errorText(error), checkedAt: Date.now() } },
      }));
      toast.error("Cannot connect to cluster", errorText(error));
      return false;
    }
  },

  disconnect: async (id) => {
    try {
      await call(api.clusters.disconnect(id));
      set((state) => ({
        activeClusterId: state.activeClusterId === id ? null : state.activeClusterId,
        splitClusterId: state.splitClusterId === id ? null : state.splitClusterId,
        health: { ...state.health, [id]: { id, status: "disconnected", checkedAt: Date.now() } },
      }));
    } catch (error) {
      toast.error("Cannot disconnect", errorText(error));
    }
  },

  removeKubeconfig: async (path) => {
    try {
      await call(api.clusters.removeKubeconfig(path));
      const activeId = get().activeClusterId;
      if (activeId?.startsWith(`${path}::`)) {
        useSessionStore.getState().dispose(activeId);
        set({ activeClusterId: null });
      }
      const splitId = get().splitClusterId;
      if (splitId?.startsWith(`${path}::`)) set({ splitClusterId: null });
      await get().loadCatalog();
    } catch (error) {
      toast.error("Cannot remove kubeconfig", errorText(error));
    }
  },

  importViaDialog: async () => {
    try {
      const result = await call(api.clusters.addKubeconfigDialog());
      if (result.canceled) return [];
      await get().loadCatalog();
      if (result.paths.length) toast.success("Kubeconfig imported", result.paths.join("\n"));
      return result.paths;
    } catch (error) {
      toast.error("Cannot import kubeconfig", errorText(error));
      return [];
    }
  },

  toggleFavorite: async (id) => {
    const settings = get().settings;
    if (!settings) return;
    const favorites = settings.favorites.includes(id)
      ? settings.favorites.filter((entry) => entry !== id)
      : [...settings.favorites, id];
    await get().updateSettings({ favorites });
  },

  setActiveCluster: (id) => set({ activeClusterId: id }),

  openSettings: (open) => set({ settingsOpen: open }),

  checkHealth: async (id) => {
    try {
      const health = await call(api.clusters.health(id));
      set((state) => ({ health: { ...state.health, [id]: health } }));
    } catch (error) {
      set((state) => ({
        health: { ...state.health, [id]: { id, status: "error", error: errorText(error), checkedAt: Date.now() } },
      }));
    }
  },

  noteOpened: async (id) => {
    const settings = get().settings;
    if (!settings) return;
    const recentClusters = [
      { id, openedAt: Date.now() },
      ...settings.recentClusters.filter((entry) => entry.id !== id),
    ].slice(0, 12);
    set({ settings: { ...settings, recentClusters } });
    await call(api.settings.update({ recentClusters })).catch(() => undefined);
  },
}));
