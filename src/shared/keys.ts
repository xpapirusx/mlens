import type { ClusterId } from "./types";

/** Key format shared by the renderer and the main-process count API. */
export function resourceCountKey(
  clusterId: ClusterId,
  apiVersion: string,
  kind: string,
  namespace?: string,
): string {
  return `${clusterId}|${apiVersion}|${kind}|${namespace ?? "*"}`;
}

export function normalizeKind(kind: string): string {
  return kind.toLowerCase();
}
