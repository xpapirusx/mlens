import { stringify } from "yaml";
import type { KubeObject } from "@shared/types";

/**
 * `metadata` fields the API server owns. Two reads of equivalent resources
 * differ in them, and they are never something a YAML view needs — hiding them
 * is what makes the YAML tab and the two-resource diff readable.
 */
export const SERVER_MANAGED_METADATA = [
  "uid",
  "resourceVersion",
  "generation",
  "creationTimestamp",
  "managedFields",
  "selfLink",
] as const;

/** Copy of `object` without the server-managed `metadata` keys. */
export function withoutServerMetadata(object: KubeObject): KubeObject {
  const metadata: Record<string, unknown> = { ...object.metadata };
  for (const key of SERVER_MANAGED_METADATA) delete metadata[key];
  return { ...object, metadata: metadata as unknown as KubeObject["metadata"] };
}

/**
 * YAML text for an object. `ignoreServerMetadata` (the default) leaves out
 * `uid`, `resourceVersion`, `generation`, `creationTimestamp`, `managedFields`
 * and `selfLink`; applying such a document is safe because main re-reads the
 * live object and takes its resourceVersion. `lineWidth: 0` keeps long values
 * (images, annotations) on one line so diffs stay line-oriented.
 */
export function objectYaml(
  object: KubeObject | null,
  { ignoreServerMetadata = true }: { ignoreServerMetadata?: boolean } = {},
): string {
  if (!object) return "";
  const value = ignoreServerMetadata ? withoutServerMetadata(object) : object;
  return stringify(value, { lineWidth: 0 });
}
