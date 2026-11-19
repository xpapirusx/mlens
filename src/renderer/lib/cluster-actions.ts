import { useCatalogStore } from "../stores/catalog-store";
import { useSessionStore } from "../stores/session-store";
import { toast } from "../design-system/components/Toast";

/** Shared cluster activation used by the hotbar, catalog and command palette. */
export async function openCluster(clusterId: string): Promise<void> {
  const catalog = useCatalogStore.getState();
  const sessions = useSessionStore.getState();

  // The session must exist before the tab switch so the workspace has state
  // to render (an `idle` session shows the connecting animation).
  sessions.ensureSession(clusterId);

  // Switch to the cluster's tab immediately: the workspace mounts and plays
  // the connecting animation while discovery runs, instead of the catalog
  // staying on screen until the API answers.
  if (catalog.activeClusterId !== clusterId) {
    useCatalogStore.getState().setActiveCluster(clusterId);
  }

  if (sessions.sessions[clusterId]?.status === "connected") {
    // Already open — only re-activated. The idempotent main-side connect
    // refreshes health and the "recently opened" entry.
    await useCatalogStore.getState().connect(clusterId);
    return;
  }

  await sessions.initialize(clusterId);

  if (useSessionStore.getState().sessions[clusterId]?.status === "connected") {
    // Records health, latency and recents without re-running discovery.
    await useCatalogStore.getState().connect(clusterId);
  }
}

export async function disconnectCluster(clusterId: string): Promise<void> {
  const catalog = useCatalogStore.getState();
  const sessions = useSessionStore.getState();
  await catalog.disconnect(clusterId);
  sessions.dispose(clusterId);
  toast.info("Cluster disconnected");
}

/**
 * Closes a cluster tab (⌘W / the tab's X): disconnects the cluster and keeps
 * the survivor active. When the active side of a split is closed, the other
 * cluster is promoted instead of everything disappearing.
 */
export async function closeClusterTab(clusterId: string): Promise<void> {
  const catalog = useCatalogStore.getState();
  const sessions = useSessionStore.getState();
  const ids = Object.keys(sessions.sessions);
  const next = ids.find((entry) => entry !== clusterId);
  const activeId = catalog.activeClusterId;
  const splitId = catalog.splitClusterId;
  const wasSecondary = splitId === clusterId;
  const wasActive = activeId === clusterId;
  await disconnectCluster(clusterId);
  if (wasSecondary) catalog.setSplitCluster(null);
  if (wasActive) {
    if (splitId && splitId !== clusterId) {
      catalog.setActiveCluster(splitId);
      catalog.setSplitCluster(null);
    } else {
      catalog.setActiveCluster(next ?? null);
    }
  }
}
