import { create } from "zustand";
import type { ApiResourceInfo, ClusterConnectionInfo, ClusterId, ResourceKey } from "@shared/types";
import { api, call, errorText } from "../lib/api";
import { toast } from "../design-system/components/Toast";

export type DetailTab = "overview" | "details" | "yaml" | "events" | "logs" | "metrics";

export interface KindState {
  search: string;
  regex: boolean;
  sort: { key: string; direction: "asc" | "desc" } | null;
  filters: Record<string, string[]>;
  hiddenColumns: string[];
  columnWidths: Record<string, number>;
}

export type TerminalTarget =
  | { type: "local"; cwd?: string; clusterId?: ClusterId; namespace?: string }
  | {
      type: "pod";
      clusterId: ClusterId;
      namespace: string;
      pod: string;
      container: string;
      shell?: string;
    };

export interface TerminalTab {
  id: string;
  kind: "terminal";
  title: string;
  target: TerminalTarget;
}

export interface DetailsState {
  ref: ResourceKey;
  tab: DetailTab;
}

export interface ClusterSession {
  clusterId: ClusterId;
  status: "idle" | "connecting" | "connected" | "error";
  info: ClusterConnectionInfo | null;
  error?: string;
  namespaces: string[];
  resources: ApiResourceInfo[];
  discoveryError?: string;
  selectedNamespaces: string[];
  selectedKind: { apiVersion: string; kind: string } | null;
  kindStates: Record<string, KindState>;
  expandedGroups: Record<string, boolean>;
  sidebarWidth: number;
  details: DetailsState | null;
  detailsHistory: ResourceKey[];
  resourceTabs: ResourceKey[];
  dock: {
    open: boolean;
    height: number;
    tabs: TerminalTab[];
    activeTabId: string | null;
  };
}

interface SessionStore {
  sessions: Record<ClusterId, ClusterSession>;
  ensureSession: (id: ClusterId) => ClusterSession;
  initialize: (id: ClusterId) => Promise<void>;
  dispose: (id: ClusterId) => void;
  setSelectedNamespaces: (id: ClusterId, namespaces: string[]) => void;
  refreshNamespaces: (id: ClusterId) => Promise<void>;
  selectKind: (id: ClusterId, kind: { apiVersion: string; kind: string }) => void;
  kindState: (id: ClusterId, apiVersion: string, kind: string) => KindState;
  updateKindState: (
    id: ClusterId,
    apiVersion: string,
    kind: string,
    patch: Partial<KindState> | ((state: KindState) => KindState),
  ) => void;
  toggleGroup: (id: ClusterId, group: string, currentExpanded?: boolean) => void;
  setSidebarWidth: (id: ClusterId, width: number) => void;
  openDetails: (id: ClusterId, ref: ResourceKey) => void;
  setDetailsTab: (id: ClusterId, tab: DetailTab) => void;
  closeDetails: (id: ClusterId) => void;
  activateResource: (id: ClusterId, ref: ResourceKey) => void;
  closeResourceTab: (id: ClusterId, ref: ResourceKey) => void;
  detailsBack: (id: ClusterId) => void;
  refreshDetails: (id: ClusterId) => void;
  openTerminal: (id: ClusterId, target: TerminalTarget) => void;
  closeTerminal: (id: ClusterId, tabId: string) => void;
  selectTerminal: (id: ClusterId, tabId: string) => void;
  setDock: (id: ClusterId, patch: Partial<ClusterSession["dock"]>) => void;
}

const emptyKindState = (): KindState => ({
  search: "",
  regex: false,
  sort: null,
  filters: {},
  hiddenColumns: [],
  columnWidths: {},
});

function createSession(id: ClusterId, selectedNamespaces: string[] = [], sidebarWidth = 236, dockHeight = 340): ClusterSession {
  return {
    clusterId: id,
    status: "idle",
    info: null,
    namespaces: [],
    resources: [],
    selectedNamespaces,
    selectedKind: null,
    kindStates: {},
    expandedGroups: {},
    sidebarWidth,
    details: null,
    detailsHistory: [],
    resourceTabs: [],
    dock: { open: false, height: dockHeight, tabs: [], activeTabId: null },
  };
}

const PREFERRED_KINDS = [
  { apiVersion: "v1", kind: "Pod" },
  { apiVersion: "apps/v1", kind: "Deployment" },
  { apiVersion: "v1", kind: "Service" },
];

export const kindKey = (apiVersion: string, kind: string): string => `${apiVersion}|${kind}`;

export function sameRef(a: ResourceKey, b: ResourceKey): boolean {
  return (
    a.apiVersion === b.apiVersion &&
    a.kind === b.kind &&
    a.namespace === b.namespace &&
    a.name === b.name
  );
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: {},

  ensureSession: (id) => {
    const existing = get().sessions[id];
    if (existing) return existing;
    const session = createSession(id);
    set((state) => ({ sessions: { ...state.sessions, [id]: session } }));
    return session;
  },

  initialize: async (id) => {
    const current = get().ensureSession(id);
    if (current.status === "connected" || current.status === "connecting") return;

    set((state) => ({
      sessions: {
        ...state.sessions,
        [id]: { ...state.sessions[id], status: "connecting", error: undefined },
      },
    }));

    try {
      const info = await call(api.clusters.connect(id));
      const namespaces = await call(api.clusters.namespaces(id)).catch(() => []);
      let resources: ApiResourceInfo[] = [];
      let discoveryError: string | undefined;
      try {
        resources = await call(api.resources.discover(id));
      } catch (error) {
        discoveryError = errorText(error);
      }

      const preferred = PREFERRED_KINDS.map((candidate) =>
        resources.find((entry) => entry.apiVersion === candidate.apiVersion && entry.kind === candidate.kind),
      ).find(Boolean);

      set((state) => ({
        sessions: {
          ...state.sessions,
          [id]: {
            ...state.sessions[id],
            status: "connected",
            info,
            namespaces: namespaces.map((entry) => entry.name),
            resources,
            discoveryError,
            selectedNamespaces: state.sessions[id].selectedNamespaces,
            selectedKind:
              state.sessions[id].selectedKind ??
              (preferred ? { apiVersion: preferred.apiVersion, kind: preferred.kind } : null),
          },
        },
      }));
    } catch (error) {
      set((state) => ({
        sessions: {
          ...state.sessions,
          [id]: { ...state.sessions[id], status: "error", error: errorText(error) },
        },
      }));
      toast.error("Cluster session failed", errorText(error));
    }
  },

  dispose: (id) => {
    set((state) => {
      const next = { ...state.sessions };
      delete next[id];
      return { sessions: next };
    });
  },

  setSelectedNamespaces: (id, namespaces) => {
    set((state) => ({
      sessions: { ...state.sessions, [id]: { ...state.sessions[id], selectedNamespaces: namespaces } },
    }));
  },

  refreshNamespaces: async (id) => {
    const namespaces = await call(api.clusters.namespaces(id));
    set((state) => {
      const session = state.sessions[id];
      if (!session) return state;
      const names = namespaces.map((entry) => entry.name);
      return {
        sessions: {
          ...state.sessions,
          [id]: {
            ...session,
            namespaces: names,
            selectedNamespaces: session.selectedNamespaces.filter((entry) => names.includes(entry)),
          },
        },
      };
    });
  },

  selectKind: (id, kind) => {
    set((state) => ({
      sessions: {
        ...state.sessions,
        [id]: { ...state.sessions[id], selectedKind: kind },
      },
    }));
  },

  kindState: (id, apiVersion, kind) => {
    const session = get().sessions[id];
    return session?.kindStates[kindKey(apiVersion, kind)] ?? emptyKindState();
  },

  updateKindState: (id, apiVersion, kind, patch) => {
    set((state) => {
      const session = state.sessions[id];
      if (!session) return state;
      const key = kindKey(apiVersion, kind);
      const previous = session.kindStates[key] ?? emptyKindState();
      const next = typeof patch === "function" ? patch(previous) : { ...previous, ...patch };
      return {
        sessions: {
          ...state.sessions,
          [id]: { ...session, kindStates: { ...session.kindStates, [key]: next } },
        },
      };
    });
  },

  toggleGroup: (id, group, currentExpanded) => {
    set((state) => {
      const session = state.sessions[id];
      if (!session) return state;
      // Match the renderer default: only the Custom Resources parent starts
      // collapsed.
      const expanded = currentExpanded ?? session.expandedGroups[group] ?? true;
      return {
        sessions: {
          ...state.sessions,
          [id]: { ...session, expandedGroups: { ...session.expandedGroups, [group]: !expanded } },
        },
      };
    });
  },

  setSidebarWidth: (id, width) => {
    set((state) => ({
      sessions: { ...state.sessions, [id]: { ...state.sessions[id], sidebarWidth: width } },
    }));
  },

  openDetails: (id, ref) => {
    set((state) => {
      const session = state.sessions[id];
      if (!session) return state;
      const same =
        session.details?.ref.apiVersion === ref.apiVersion &&
        session.details.ref.kind === ref.kind &&
        session.details.ref.namespace === ref.namespace &&
        session.details.ref.name === ref.name;
      const history = session.details && !same ? [session.details.ref, ...session.detailsHistory].slice(0, 25) : session.detailsHistory;
      const exists = session.resourceTabs.some((tab) => sameRef(tab, ref));
      return {
        sessions: {
          ...state.sessions,
          [id]: {
            ...session,
            details: {
              ref,
              tab:
                ref.kind !== "Pod" && session.details?.tab === "logs"
                  ? "overview"
                  : (session.details?.tab ?? "overview"),
            },
            detailsHistory: history,
            resourceTabs: exists ? session.resourceTabs : [...session.resourceTabs, ref],
          },
        },
      };
    });
  },

  setDetailsTab: (id, tab) => {
    set((state) => {
      const session = state.sessions[id];
      if (!session?.details) return state;
      return {
        sessions: {
          ...state.sessions,
          [id]: { ...session, details: { ...session.details, tab } },
        },
      };
    });
  },

  closeDetails: (id) => {
    set((state) => {
      const session = state.sessions[id];
      if (!session?.details) return state;
      const active = session.details.ref;
      const tabs = session.resourceTabs.filter((tab) => !sameRef(tab, active));
      const next = tabs[tabs.length - 1] ?? null;
      return {
        sessions: {
          ...state.sessions,
          [id]: {
            ...session,
            resourceTabs: tabs,
            details: next ? { ...session.details, ref: next } : null,
          },
        },
      };
    });
  },

  activateResource: (id, ref) => {
    set((state) => {
      const session = state.sessions[id];
      if (!session) return state;
      const exists = session.resourceTabs.some((tab) => sameRef(tab, ref));
      return {
        sessions: {
          ...state.sessions,
          [id]: {
            ...session,
            details: {
              ref,
              tab:
                ref.kind !== "Pod" && session.details?.tab === "logs"
                  ? "overview"
                  : (session.details?.tab ?? "overview"),
            },
            resourceTabs: exists ? session.resourceTabs : [...session.resourceTabs, ref],
          },
        },
      };
    });
  },

  closeResourceTab: (id, ref) => {
    set((state) => {
      const session = state.sessions[id];
      if (!session) return state;
      const index = session.resourceTabs.findIndex((tab) => sameRef(tab, ref));
      const tabs = session.resourceTabs.filter((tab) => !sameRef(tab, ref));
      const isActive = session.details ? sameRef(session.details.ref, ref) : false;
      const fallback = tabs[Math.max(0, index - 1)] ?? tabs[0] ?? null;
      return {
        sessions: {
          ...state.sessions,
          [id]: {
            ...session,
            resourceTabs: tabs,
            details: isActive ? (fallback ? { ...session.details!, ref: fallback } : null) : session.details,
          },
        },
      };
    });
  },

  detailsBack: (id) => {
    set((state) => {
      const session = state.sessions[id];
      if (!session?.details || session.detailsHistory.length === 0) return state;
      const [previous, ...rest] = session.detailsHistory;
      return {
        sessions: {
          ...state.sessions,
          [id]: {
            ...session,
            details: { ...session.details, ref: previous },
            detailsHistory: rest,
            resourceTabs: session.resourceTabs.some((tab) => sameRef(tab, previous))
              ? session.resourceTabs
              : [...session.resourceTabs, previous],
          },
        },
      };
    });
  },

  refreshDetails: (id) => {
    set((state) => {
      const session = state.sessions[id];
      if (!session?.details) return state;
      return {
        sessions: {
          ...state.sessions,
          [id]: { ...session, details: { ...session.details } },
        },
      };
    });
  },

  openTerminal: (id, requestedTarget) => {
    set((state) => {
      const session = state.sessions[id];
      if (!session) return state;
      const target: TerminalTarget =
        requestedTarget.type === "local"
          ? {
              ...requestedTarget,
              clusterId: requestedTarget.clusterId ?? id,
              namespace:
                requestedTarget.namespace ??
                (session.selectedNamespaces.length === 1 ? session.selectedNamespaces[0] : undefined),
            }
          : requestedTarget;
      const existing = session.dock.tabs.find((tab) => {
        if (tab.target.type !== target.type) return false;
        if (tab.target.type === "pod" && target.type === "pod") {
          return (
            tab.target.clusterId === target.clusterId &&
            tab.target.namespace === target.namespace &&
            tab.target.pod === target.pod &&
            tab.target.container === target.container
          );
        }
        return false;
      });
      if (existing) {
        return {
          sessions: {
            ...state.sessions,
            [id]: { ...session, dock: { ...session.dock, open: true, activeTabId: existing.id } },
          },
        };
      }
      const index = session.dock.tabs.length + 1;
      const title =
        target.type === "pod"
          ? `${target.pod}${target.container ? ` / ${target.container}` : ""}`
          : `Terminal ${index}`;
      const tab: TerminalTab = {
        id: `term-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        kind: "terminal",
        title,
        target,
      };
      return {
        sessions: {
          ...state.sessions,
          [id]: {
            ...session,
            dock: {
              ...session.dock,
              open: true,
              tabs: [...session.dock.tabs, tab],
              activeTabId: tab.id,
            },
          },
        },
      };
    });
  },

  closeTerminal: (id, tabId) => {
    set((state) => {
      const session = state.sessions[id];
      if (!session) return state;
      const tabs = session.dock.tabs.filter((tab) => tab.id !== tabId);
      const activeTabId =
        session.dock.activeTabId === tabId
          ? (tabs[tabs.length - 1]?.id ?? null)
          : session.dock.activeTabId;
      return {
        sessions: {
          ...state.sessions,
          [id]: {
            ...session,
            dock: { ...session.dock, tabs, activeTabId, open: tabs.length > 0 ? session.dock.open : false },
          },
        },
      };
    });
  },

  selectTerminal: (id, tabId) => {
    set((state) => {
      const session = state.sessions[id];
      if (!session) return state;
      return {
        sessions: {
          ...state.sessions,
          [id]: { ...session, dock: { ...session.dock, activeTabId: tabId } },
        },
      };
    });
  },

  setDock: (id, patch) => {
    set((state) => {
      const session = state.sessions[id];
      if (!session) return state;
      return {
        sessions: { ...state.sessions, [id]: { ...session, dock: { ...session.dock, ...patch } } },
      };
    });
  },
}));

/** Build the key used by the details drawer for a given API resource kind. */
export function childKey(apiVersion: string, kind: string, namespace: string | undefined, name: string): string {
  return `${apiVersion}|${kind}|${namespace ?? ""}|${name}`;
}
