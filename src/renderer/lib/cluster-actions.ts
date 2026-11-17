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
