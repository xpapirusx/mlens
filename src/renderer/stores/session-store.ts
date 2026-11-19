import { create } from "zustand";
import type { ApiResourceInfo, ClusterConnectionInfo, ClusterId, ResourceKey } from "@shared/types";
import { api, call, errorText } from "../lib/api";
import { toast } from "../design-system/components/Toast";

export type DetailTab = "overview" | "details" | "yaml" | "events" | "related" | "logs" | "metrics";

/** Where a new editor pane is created relative to its source pane. */
export type SplitDirection = "right" | "down";

export interface KindState {
  search: string;
  regex: boolean;
  sort: { key: string; direction: "asc" | "desc" } | null;
  filters: Record<string, string[]>;
  hiddenColumns: string[];
  columnWidths: Record<string, number>;
  /** Column keys frozen to the left edge of the table. */
  pinnedColumns: string[];
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
      /** `attach` connects to the running process; otherwise a shell is exec'd. */
      mode?: "exec" | "attach";
      /** Node debug shell: mLens created this pod, so closing the tab deletes it. */
      managedPod?: boolean;
    };

export interface TerminalTab {
  id: string;
  kind: "terminal";
  title: string;
  target: TerminalTarget;
}

/** Bottom-dock tab holding the multi-document YAML editor. */
export interface YamlTab {
  id: string;
  kind: "yaml";
  title: string;
}

export type DockTab = TerminalTab | YamlTab;

export interface EditorPaneState {
  id: string;
  /** Absolute cell in the 2×2 layout grid: 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right. */
  slot: number;
  tabs: ResourceKey[];
  active: ResourceKey | null;
  /** Inner details tab (Overview / Details / YAML / …) kept per pane. */
  tab: DetailTab;
  /** Back history for this pane. */
  history: ResourceKey[];
}

export interface EditorState {
  panes: EditorPaneState[];
  activePaneId: string;
  /** Editor-area width in px (dragged on the left edge). */
  width: number;
  /** Editor area collapsed to the tray / pill; its tabs stay open. */
  minimized: boolean;
  /** Fraction of the width given to the left column when split in two. */
  columnSplit: number;
  /** Fraction of the height given to the top row when split in two. */
  rowSplit: number;
}

export type ConnectStage = "api" | "namespaces" | "discovery" | "done";

export interface ClusterSession {
  clusterId: ClusterId;
  status: "idle" | "connecting" | "connected" | "error";
  info: ClusterConnectionInfo | null;
  error?: string;
  /** Real progress of initialize(): which step runs and how far we are. */
  connectStage?: ConnectStage;
  connectPercent?: number;
  namespaces: string[];
  resources: ApiResourceInfo[];
  discoveryError?: string;
  selectedNamespaces: string[];
  selectedKind: { apiVersion: string; kind: string } | null;
  kindStates: Record<string, KindState>;
  expandedGroups: Record<string, boolean>;
  sidebarWidth: number;
  /** VS Code-like editor area: split panes with resource tabs. */
  editor: EditorState;
  dock: {
    open: boolean;
    height: number;
    tabs: DockTab[];
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
  /** Opens/activates a resource in the active editor pane. */
  openDetails: (id: ClusterId, ref: ResourceKey) => void;
  /** Opens/activates a resource in a specific pane (Related/Details navigation). */
  openInPane: (id: ClusterId, paneId: string, ref: ResourceKey) => void;
  /** Splits the active pane and opens the resource in the new one. */
  openDetailsInNewPane: (id: ClusterId, ref: ResourceKey, direction: SplitDirection) => void;
  setDetailsTab: (id: ClusterId, tab: DetailTab) => void;
  setPaneTab: (id: ClusterId, paneId: string, tab: DetailTab) => void;
  /** Closes the active tab of the active pane (kept as the Escape/⌘W action). */
  closeDetails: (id: ClusterId) => void;
  minimizeDetails: (id: ClusterId) => void;
  restoreDetails: (id: ClusterId) => void;
  activateResource: (id: ClusterId, ref: ResourceKey) => void;
  closeResourceTab: (id: ClusterId, ref: ResourceKey) => void;
  closePaneTab: (id: ClusterId, paneId: string, ref: ResourceKey) => void;
  closeOtherPaneTabs: (id: ClusterId, paneId: string, ref: ResourceKey) => void;
  closePaneTabsToRight: (id: ClusterId, paneId: string, ref: ResourceKey) => void;
  detailsBack: (id: ClusterId) => void;
  paneBack: (id: ClusterId, paneId: string) => void;
  setActivePane: (id: ClusterId, paneId: string) => void;
  moveTab: (id: ClusterId, sourcePaneId: string, targetPaneId: string, ref: ResourceKey) => void;
  reorderTab: (id: ClusterId, paneId: string, ref: ResourceKey, toIndex: number) => void;
  setEditorWidth: (id: ClusterId, width: number) => void;
  setEditorSplit: (id: ClusterId, patch: { columnSplit?: number; rowSplit?: number }) => void;
  openTerminal: (id: ClusterId, target: TerminalTarget) => void;
  /** Opens (or focuses) the dock's multi-document YAML editor tab. */
  openYamlTab: (id: ClusterId) => void;
  closeTerminal: (id: ClusterId, tabId: string) => void;
  selectTerminal: (id: ClusterId, tabId: string) => void;
  setDock: (id: ClusterId, patch: Partial<ClusterSession["dock"]>) => void;
}

export const emptyKindState = (): KindState => ({
  search: "",
  regex: false,
  sort: null,
  filters: {},
  hiddenColumns: [],
  columnWidths: {},
  pinnedColumns: [],
});

function createSession(id: ClusterId, selectedNamespaces: string[] = [], sidebarWidth = 236, dockHeight = 340): ClusterSession {
  const pane = newEditorPane(0);
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
    editor: {
      panes: [pane],
      activePaneId: pane.id,
      width: 560,
      minimized: false,
      columnSplit: 0.5,
      rowSplit: 0.5,
    },
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

let paneSequence = 0;

/** A fresh, empty editor pane occupying one cell of the 2×2 grid. */
export function newEditorPane(slot: number): EditorPaneState {
  paneSequence += 1;
  return {
    id: `pane-${Date.now().toString(36)}-${paneSequence}`,
    slot,
    tabs: [],
    active: null,
    tab: "overview",
    history: [],
  };
}

/** Columns/rows are derived from each pane's absolute slot (2×2 max). */
export function editorLayout(panes: EditorPaneState[]): { columns: 1 | 2; rows: 1 | 2 } {
  return {
    columns: panes.some((pane) => pane.slot % 2 === 1) ? 2 : 1,
    rows: panes.some((pane) => pane.slot >= 2) ? 2 : 1,
  };
}

export function activePaneOf(session: ClusterSession | undefined): EditorPaneState | undefined {
  if (!session) return undefined;
  return (
    session.editor.panes.find((pane) => pane.id === session.editor.activePaneId) ??
    session.editor.panes[0]
  );
}

export function hasEditorTab(session: ClusterSession | undefined): boolean {
  return !!session && session.editor.panes.some((pane) => pane.active !== null);
}

/** Re-pack panes into the smallest sensible 2×2 layout after a pane closes. */
function compactPanes(panes: EditorPaneState[]): EditorPaneState[] {
  const sorted = [...panes].sort((left, right) => left.slot - right.slot);
  if (sorted.length === 2) {
    // Keep the axis from the previous layout: same column → stacked, else side by side.
    const stacked = sorted.every((pane) => pane.slot % 2 === 0);
    const slots = stacked ? [0, 2] : [0, 1];
    return sorted.map((pane, index) => ({ ...pane, slot: slots[index] }));
  }
  return sorted.map((pane, index) => ({ ...pane, slot: Math.min(index, 3) }));
}

/** Opens (or re-activates) a resource inside one pane, preserving per-pane history. */
function withOpenedRef(pane: EditorPaneState, ref: ResourceKey, resources: ApiResourceInfo[]): EditorPaneState {
  const same = pane.active !== null && sameRef(pane.active, ref);
  const history =
    !same && pane.active ? [pane.active, ...pane.history].slice(0, 25) : pane.history;
  const target = resources.find(
    (entry) => entry.apiVersion === ref.apiVersion && entry.kind === ref.kind,
  );
  // Custom resources open on Details (Freelens field order) instead of a
  // generic Overview; users can switch to Overview/YAML at any time.
  const defaultTab: DetailTab = target?.isCrd ? "details" : "overview";
  const tab = same
    ? pane.tab
    : ref.kind !== "Pod" && pane.tab === "logs"
      ? "overview"
      : defaultTab;
  const exists = pane.tabs.some((entry) => sameRef(entry, ref));
  return {
    ...pane,
    tabs: exists ? pane.tabs : [...pane.tabs, ref],
    active: ref,
    tab,
    history,
  };
}

/** Clicking an already-open tab keeps that pane's inner tab. */
function withActivatedRef(pane: EditorPaneState, ref: ResourceKey): EditorPaneState {
  const exists = pane.tabs.some((entry) => sameRef(entry, ref));
  return {
    ...pane,
    tabs: exists ? pane.tabs : [...pane.tabs, ref],
    active: ref,
    tab: ref.kind !== "Pod" && pane.tab === "logs" ? "overview" : pane.tab,
  };
}

type EditorPatch = Partial<EditorState>;

function applyEditor(
  state: { sessions: Record<ClusterId, ClusterSession> },
  id: ClusterId,
  session: ClusterSession,
  patch: EditorPatch,
) {
  return {
    sessions: {
      ...state.sessions,
      [id]: { ...session, editor: { ...session.editor, ...patch } },
    },
  };
}

function closeTab(
  state: { sessions: Record<ClusterId, ClusterSession> },
  id: ClusterId,
  session: ClusterSession,
  paneId: string,
  ref: ResourceKey,
) {
  const panes = session.editor.panes
    .map((pane) => {
      if (pane.id !== paneId) return pane;
      const index = pane.tabs.findIndex((tab) => sameRef(tab, ref));
      if (index < 0) return pane;
      const tabs = pane.tabs.filter((tab) => !sameRef(tab, ref));
      const isActive = pane.active !== null && sameRef(pane.active, ref);
      const fallback = isActive ? (tabs[Math.max(0, index - 1)] ?? tabs[0] ?? null) : pane.active;
      return { ...pane, tabs, active: fallback };
    })
    .filter((pane) => pane.tabs.length > 0);
  const compacted = panes.length > 0 ? compactPanes(panes) : [newEditorPane(0)];
  const activeExists = compacted.some((pane) => pane.id === session.editor.activePaneId);
  return applyEditor(state, id, session, {
    panes: compacted,
    activePaneId: activeExists ? session.editor.activePaneId : compacted[0].id,
  });
}

function backPane(
  state: { sessions: Record<ClusterId, ClusterSession> },
  id: ClusterId,
  session: ClusterSession,
  paneId: string,
) {
  const pane = session.editor.panes.find((entry) => entry.id === paneId);
  if (!pane || pane.history.length === 0) return state;
  const [previous, ...rest] = pane.history;
  return applyEditor(state, id, session, {
    panes: session.editor.panes.map((entry) =>
      entry.id === paneId
        ? {
            ...entry,
            active: previous,
            history: rest,
            tab: previous.kind !== "Pod" && entry.tab === "logs" ? "overview" : entry.tab,
            tabs: entry.tabs.some((tab) => sameRef(tab, previous))
              ? entry.tabs
              : [...entry.tabs, previous],
          }
        : entry,
    ),
    activePaneId: paneId,
  });
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

    const progress = (connectStage: ConnectStage, connectPercent: number) =>
      set((state) => ({
        sessions: {
          ...state.sessions,
          [id]: {
            ...state.sessions[id],
            status: "connecting",
            error: undefined,
            connectStage,
            connectPercent,
          },
        },
      }));

    progress("api", 5);
    try {
      const info = await call(api.clusters.connect(id));
      progress("namespaces", 45);
      const namespaces = await call(api.clusters.namespaces(id)).catch(() => []);
      progress("discovery", 70);
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
            connectStage: "done",
            connectPercent: 100,
            namespaces: namespaces.map((entry) => entry.name),
            resources,
            discoveryError,
            selectedNamespaces: state.sessions[id].selectedNamespaces,
            selectedKind:
              state.sessions[id].selectedKind ??
              (resources.length > 0
                ? { apiVersion: "", kind: "__overview__" }
                : preferred
                  ? { apiVersion: preferred.apiVersion, kind: preferred.kind }
                  : null),
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
      const pane = activePaneOf(session);
      if (!pane) return state;
      return applyEditor(state, id, session, {
        panes: session.editor.panes.map((entry) =>
          entry.id === pane.id ? withOpenedRef(entry, ref, session.resources) : entry,
        ),
        activePaneId: pane.id,
        minimized: false,
      });
    });
  },

  openInPane: (id, paneId, ref) => {
    set((state) => {
      const session = state.sessions[id];
      if (!session) return state;
      const pane = session.editor.panes.find((entry) => entry.id === paneId) ?? activePaneOf(session);
      if (!pane) return state;
      return applyEditor(state, id, session, {
        panes: session.editor.panes.map((entry) =>
          entry.id === pane.id ? withOpenedRef(entry, ref, session.resources) : entry,
        ),
        activePaneId: pane.id,
        minimized: false,
      });
    });
  },

  openDetailsInNewPane: (id, ref, direction) => {
    set((state) => {
      const session = state.sessions[id];
      const source = session && activePaneOf(session);
      if (!session || !source) return state;
      const targetSlot =
        direction === "right"
          ? source.slot % 2 === 0
            ? source.slot + 1
            : -1
          : source.slot < 2
            ? source.slot + 2
            : -1;
      if (targetSlot < 0 || targetSlot > 3) return state;
      if (session.editor.panes.some((pane) => pane.slot === targetSlot)) return state;
      const pane = withOpenedRef(newEditorPane(targetSlot), ref, session.resources);
      return applyEditor(state, id, session, {
        panes: [...session.editor.panes, pane],
        activePaneId: pane.id,
        minimized: false,
      });
    });
  },

  setDetailsTab: (id, tab) => {
    set((state) => {
      const session = state.sessions[id];
      const pane = session && activePaneOf(session);
      if (!session || !pane) return state;
      return applyEditor(state, id, session, {
        panes: session.editor.panes.map((entry) => (entry.id === pane.id ? { ...entry, tab } : entry)),
      });
    });
  },

  setPaneTab: (id, paneId, tab) => {
    set((state) => {
      const session = state.sessions[id];
      if (!session) return state;
      return applyEditor(state, id, session, {
        panes: session.editor.panes.map((entry) => (entry.id === paneId ? { ...entry, tab } : entry)),
      });
    });
  },

  closeDetails: (id) => {
    set((state) => {
      const session = state.sessions[id];
      const pane = session && activePaneOf(session);
      if (!session || !pane?.active) return state;
      return closeTab(state, id, session, pane.id, pane.active);
    });
  },

  activateResource: (id, ref) => {
    set((state) => {
      const session = state.sessions[id];
      const pane = session && activePaneOf(session);
      if (!session || !pane) return state;
      return applyEditor(state, id, session, {
        panes: session.editor.panes.map((entry) =>
          entry.id === pane.id ? withActivatedRef(entry, ref) : entry,
        ),
        activePaneId: pane.id,
        minimized: false,
      });
    });
  },

  minimizeDetails: (id) => {
    set((state) => {
      const session = state.sessions[id];
      if (!session || !hasEditorTab(session)) return state;
      return applyEditor(state, id, session, { minimized: true });
    });
  },

  restoreDetails: (id) => {
    set((state) => {
      const session = state.sessions[id];
      if (!session) return state;
      return applyEditor(state, id, session, { minimized: false });
    });
  },

  closeResourceTab: (id, ref) => {
    set((state) => {
      const session = state.sessions[id];
      if (!session) return state;
      const active = activePaneOf(session);
      const pane =
        (active?.tabs.some((tab) => sameRef(tab, ref)) ? active : null) ??
        session.editor.panes.find((entry) => entry.tabs.some((tab) => sameRef(tab, ref)));
      if (!pane) return state;
      return closeTab(state, id, session, pane.id, ref);
    });
  },

  closePaneTab: (id, paneId, ref) => {
    set((state) => {
      const session = state.sessions[id];
      if (!session) return state;
      return closeTab(state, id, session, paneId, ref);
    });
  },

  closeOtherPaneTabs: (id, paneId, ref) => {
    set((state) => {
      const session = state.sessions[id];
      if (!session) return state;
      return applyEditor(state, id, session, {
        panes: session.editor.panes.map((entry) =>
          entry.id === paneId ? { ...entry, tabs: [ref], active: ref } : entry,
        ),
      });
    });
  },

  closePaneTabsToRight: (id, paneId, ref) => {
    set((state) => {
      const session = state.sessions[id];
      if (!session) return state;
      return applyEditor(state, id, session, {
        panes: session.editor.panes.map((entry) => {
          if (entry.id !== paneId) return entry;
          const index = entry.tabs.findIndex((tab) => sameRef(tab, ref));
          if (index < 0) return entry;
          const tabs = entry.tabs.slice(0, index + 1);
          const active = entry.active && tabs.some((tab) => sameRef(tab, entry.active!)) ? entry.active : ref;
          return { ...entry, tabs, active };
        }),
      });
    });
  },

  detailsBack: (id) => {
    set((state) => {
      const session = state.sessions[id];
      const pane = session && activePaneOf(session);
      if (!session || !pane) return state;
      return backPane(state, id, session, pane.id);
    });
  },

  paneBack: (id, paneId) => {
    set((state) => {
      const session = state.sessions[id];
      if (!session) return state;
      return backPane(state, id, session, paneId);
    });
  },

  setActivePane: (id, paneId) => {
    set((state) => {
      const session = state.sessions[id];
      if (!session || session.editor.activePaneId === paneId) return state;
      return applyEditor(state, id, session, { activePaneId: paneId });
    });
  },

  moveTab: (id, sourcePaneId, targetPaneId, ref) => {
    set((state) => {
      const session = state.sessions[id];
      if (!session || sourcePaneId === targetPaneId) return state;
      const source = session.editor.panes.find((pane) => pane.id === sourcePaneId);
      const target = session.editor.panes.find((pane) => pane.id === targetPaneId);
      if (!source || !target || !source.tabs.some((tab) => sameRef(tab, ref))) return state;
      const panes = session.editor.panes
        .map((pane) => {
          if (pane.id === sourcePaneId) {
            const tabs = pane.tabs.filter((tab) => !sameRef(tab, ref));
            return {
              ...pane,
              tabs,
              active: pane.active && sameRef(pane.active, ref) ? (tabs[0] ?? null) : pane.active,
            };
          }
          if (pane.id === targetPaneId) {
            const exists = pane.tabs.some((tab) => sameRef(tab, ref));
            return { ...pane, tabs: exists ? pane.tabs : [...pane.tabs, ref], active: ref };
          }
          return pane;
        })
        .filter((pane) => pane.tabs.length > 0);
      const compacted = compactPanes(panes);
      const activeExists = compacted.some((pane) => pane.id === session.editor.activePaneId);
      return applyEditor(state, id, session, {
        panes: compacted,
        activePaneId: activeExists ? session.editor.activePaneId : targetPaneId,
        minimized: false,
      });
    });
  },

  reorderTab: (id, paneId, ref, toIndex) => {
    set((state) => {
      const session = state.sessions[id];
      if (!session) return state;
      return applyEditor(state, id, session, {
        panes: session.editor.panes.map((entry) => {
          if (entry.id !== paneId) return entry;
          const from = entry.tabs.findIndex((tab) => sameRef(tab, ref));
          if (from < 0) return entry;
          const tabs = [...entry.tabs];
          const [moved] = tabs.splice(from, 1);
          tabs.splice(Math.max(0, Math.min(tabs.length, toIndex)), 0, moved);
          return { ...entry, tabs };
        }),
      });
    });
  },

  setEditorWidth: (id, width) => {
    set((state) => {
      const session = state.sessions[id];
      if (!session) return state;
      return applyEditor(state, id, session, { width: Math.min(Math.max(360, Math.round(width)), 1400) });
    });
  },

  setEditorSplit: (id, patch) => {
    set((state) => {
      const session = state.sessions[id];
      if (!session) return state;
      const clamp = (value: number | undefined, fallback: number) =>
        value === undefined ? fallback : Math.min(0.8, Math.max(0.2, value));
      return applyEditor(state, id, session, {
        columnSplit: clamp(patch.columnSplit, session.editor.columnSplit),
        rowSplit: clamp(patch.rowSplit, session.editor.rowSplit),
      });
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
        if (tab.kind !== "terminal") return false;
        if (tab.target.type !== target.type) return false;
        if (tab.target.type === "pod" && target.type === "pod") {
          return (
            tab.target.clusterId === target.clusterId &&
            tab.target.namespace === target.namespace &&
            tab.target.pod === target.pod &&
            tab.target.container === target.container &&
            (tab.target.mode ?? "exec") === (target.mode ?? "exec")
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
          ? `${target.mode === "attach" ? "attach · " : ""}${target.pod}${target.container ? ` / ${target.container}` : ""}`
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

  openYamlTab: (id) => {
    set((state) => {
      const session = state.sessions[id];
      if (!session) return state;
      const existing = session.dock.tabs.find((tab) => tab.kind === "yaml");
      if (existing) {
        return {
          sessions: {
            ...state.sessions,
            [id]: { ...session, dock: { ...session.dock, open: true, activeTabId: existing.id } },
          },
        };
      }
      const tab: YamlTab = {
        id: `yaml-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        kind: "yaml",
        title: "Create from YAML",
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
    const closed = get().sessions[id]?.dock.tabs.find((tab) => tab.id === tabId);
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
    // A node debug shell owns the pod it created: closing the console deletes
    // it, so repeated debugging does not leave privileged pods behind.
    if (closed?.kind === "terminal" && closed.target.type === "pod" && closed.target.managedPod) {
      const target = closed.target;
      void call(
        api.resources.delete({
          clusterId: id,
          apiVersion: "v1",
          kind: "Pod",
          namespace: target.namespace,
          name: target.pod,
          propagationPolicy: "Background",
        }),
      )
        .then(() => toast.success("Debug pod deleted", `${target.namespace}/${target.pod}`))
        .catch((error) => toast.error("Cannot delete debug pod", errorText(error)));
    }
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

/**
 * A14: stable signature of the session fields cluster chrome renders (status +
 * connection info). Tabs, hotbar and catalog subscribe to this string instead
 * of the sessions map, so keystroke-level session writes (search, filters,
 * dock, drawer tabs) stop re-rendering the whole shell. The map itself is
 * read fresh through `getState()` whenever the signature changes.
 */
export function sessionChromeKey(sessions: Record<ClusterId, ClusterSession>): string {
  return Object.entries(sessions)
    .map(
      ([id, session]) =>
        `${id}=${session.status}/${session.info?.context ?? ""}/${session.info?.name ?? ""}/${session.info?.version ?? ""}`,
    )
    .join("\n");
}

/** Sessions map for cluster chrome — re-renders only on status/info changes. */
export function useChromeSessions(): Record<ClusterId, ClusterSession> {
  useSessionStore((state) => sessionChromeKey(state.sessions));
  return useSessionStore.getState().sessions;
}
