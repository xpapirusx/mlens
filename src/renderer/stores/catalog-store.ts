import { create } from "zustand";
import type { AppSettings, ClusterHealth, ClusterId, ClusterSummary, KubeconfigSource } from "@shared/types";
import { api, call, errorText } from "../lib/api";
import { toast } from "../design-system/components/Toast";
import { useSessionStore } from "./session-store";

interface CatalogStore {
  settings: AppSettings | null;
  settingsOpen: boolean;
  sources: KubeconfigSource[];
  clusters: ClusterSummary[];
  health: Record<ClusterId, ClusterHealth>;
  activeClusterId: ClusterId | null;
  loadingCatalog: boolean;
  catalogError: string | null;
  connecting: Record<ClusterId, boolean>;
  loadSettings: () => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  loadCatalog: () => Promise<void>;
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
  clusters: [],
  health: {},
  activeClusterId: null,
  loadingCatalog: false,
  catalogError: null,
  connecting: {},

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
      set({ settings });
    } catch (error) {
      toast.error("Cannot save settings", errorText(error));
    }
  },

  loadCatalog: async () => {
    set({ loadingCatalog: true, catalogError: null });
    try {
      const result = await call(api.clusters.listKubeconfigs());
      set({ sources: result.sources, clusters: result.clusters, loadingCatalog: false });
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
