import { useCatalogStore } from "../stores/catalog-store";
import { useSessionStore } from "../stores/session-store";
import { api } from "./api";
import { toast } from "../design-system/components/Toast";

/** Shared cluster activation used by the hotbar, catalog and command palette. */
export async function openCluster(clusterId: string): Promise<void> {
  const catalog = useCatalogStore.getState();
  const sessions = useSessionStore.getState();
  sessions.ensureSession(clusterId);

  if (catalog.activeClusterId === clusterId && sessions.sessions[clusterId]?.status === "connected") return;

  const connected = await catalog.connect(clusterId);
  if (!connected) return;
  await sessions.initialize(clusterId);
}

export async function disconnectCluster(clusterId: string): Promise<void> {
  const catalog = useCatalogStore.getState();
  const sessions = useSessionStore.getState();
  await catalog.disconnect(clusterId);
  sessions.dispose(clusterId);
  await api.clusters.disconnect(clusterId).catch(() => undefined);
  toast.info("Cluster disconnected");
}
