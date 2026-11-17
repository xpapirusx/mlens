import { gunzipSync, gzipSync } from "node:zlib";
import { dumpYaml, loadAllYaml } from "@kubernetes/client-node";
import { buildApiPath, kubeRequest } from "./http";
import type { ClusterConnection } from "./session";
import type {
  HelmManifestRef,
  HelmReleaseDetail,
  HelmReleaseRequest,
  HelmReleaseSummary,
  HelmReleasesRequest,
} from "@shared/types";

/**
 * Helm releases without Helm: v3 stores each release as a Secret labelled
 * `owner=helm` (and `name=<release>`, `version=<n>`), with `release` =
 * base64(gzip(release JSON)). Reading those gives status, chart, revision,
 * values and rendered manifests — no binary, no chart repository.
 */

const MAX_TEXT = 200_000;

interface RawSecret {
  metadata?: { name?: string; namespace?: string; labels?: Record<string, string> };
  type?: string;
  data?: Record<string, string>;
}

interface RawList<T> {
  items?: T[];
  metadata?: { continue?: string };
}

interface ReleaseJson {
  name?: string;
  namespace?: string;
  version?: number;
  info?: { status?: string; last_deployed?: string; description?: string };
  chart?: { metadata?: { name?: string; version?: string; appVersion?: string } };
  config?: Record<string, unknown>;
  manifest?: string;
}

function decodeRelease(secret: RawSecret): ReleaseJson | null {
  const encoded = secret.data?.release;
  if (!encoded) return null;
  try {
    // The API base64-encodes the Secret value, and Helm's own value is
    // base64(gzip(json)) — so one decode can leave base64 text that needs a
    // second pass before gunzip. The gzip magic decides which path applies.
    let bytes = Buffer.from(encoded, "base64");
    if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
      const text = bytes.toString("utf8").trim();
      if (/^[A-Za-z0-9+/=\s]+$/.test(text)) {
        const inner = Buffer.from(text, "base64");
        if (inner[0] === 0x1f && inner[1] === 0x8b) bytes = inner;
      }
    }
    const json = gunzipSync(bytes).toString("utf8");
    return JSON.parse(json) as ReleaseJson;
  } catch {
    // A corrupted or hand-edited secret: skip it rather than fail the list.
    return null;
  }
}

function toSummary(secret: RawSecret, release: ReleaseJson): HelmReleaseSummary {
  const metadata = release.chart?.metadata;
  const chartName = metadata?.name ?? "unknown";
  const chartVersion = metadata?.version ?? "";
  return {
    name: release.name ?? secret.metadata?.name ?? "",
    namespace: release.namespace ?? secret.metadata?.namespace ?? "",
    revision: Number(release.version ?? 1),
    status: release.info?.status ?? "unknown",
    chart: chartVersion ? `${chartName}-${chartVersion}` : chartName,
    chartName,
    chartVersion,
    appVersion: metadata?.appVersion,
    deployedAt: release.info?.last_deployed,
    description: release.info?.description,
    secretName: secret.metadata?.name ?? "",
  };
}

async function listSecrets(
  connection: ClusterConnection,
  namespace: string | undefined,
  labelSelector: string,
): Promise<RawSecret[]> {
  const info = await connection.catalog.get("v1", "Secret");
  const apiPath = buildApiPath(info.apiVersion, info.plural, namespace);
  const items: RawSecret[] = [];
  let continueToken: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const result = await kubeRequest<RawList<RawSecret>>(connection.kc, apiPath, {
      query: { labelSelector, limit: 500, continue: continueToken },
      timeoutMs: 30_000,
    });
    items.push(...(result.items ?? []));
    continueToken = result.metadata?.continue;
    if (!continueToken) break;
  }
  return items;
}

/** One row per release: the newest revision wins (older ones are history). */
export async function listHelmReleases(
  connection: ClusterConnection,
  request: HelmReleasesRequest,
): Promise<HelmReleaseSummary[]> {
  const secrets = await listSecrets(connection, request.namespace, "owner=helm");
  const byRelease = new Map<string, HelmReleaseSummary>();
  for (const secret of secrets) {
    if (secret.metadata?.labels?.owner !== "helm") continue;
    const release = decodeRelease(secret);
    if (!release?.name) continue;
    const summary = toSummary(secret, release);
    const key = `${summary.namespace}/${summary.name}`;
    const current = byRelease.get(key);
    if (!current || summary.revision > current.revision) byRelease.set(key, summary);
  }
  return [...byRelease.values()].sort(
    (left, right) =>
      left.namespace.localeCompare(right.namespace) || left.name.localeCompare(right.name),
  );
}

export async function getHelmRelease(
  connection: ClusterConnection,
  request: HelmReleaseRequest & { revision?: number },
): Promise<HelmReleaseDetail> {
  // Not filtered by the `name` label: which labels a Helm version writes is
  // version-dependent, while the decoded record always carries the name.
  const secrets = await listSecrets(connection, request.namespace, "owner=helm");
  const matches: Array<{ secret: RawSecret; release: ReleaseJson }> = [];
  for (const secret of secrets) {
    const release = decodeRelease(secret);
    if (!release?.name || release.name !== request.name) continue;
    matches.push({ secret, release });
  }
  matches.sort((left, right) => Number(right.release.version ?? 1) - Number(left.release.version ?? 1));
  if (matches.length === 0) {
    throw new Error(`Helm release ${request.namespace}/${request.name} was not found in this cluster.`);
  }

  const current = matches[0];
  const viewed =
    (request.revision !== undefined
      ? matches.find((entry) => Number(entry.release.version ?? 1) === request.revision)
      : undefined) ?? current;

  const summary = toSummary(viewed.secret, viewed.release);
  let values = "";
  try {
    values = viewed.release.config ? dumpYaml(viewed.release.config) : "";
  } catch {
    values = "";
  }
  const manifest = viewed.release.manifest ?? "";
  const truncated = values.length > MAX_TEXT || manifest.length > MAX_TEXT;

  return {
    ...summary,
    values: values.slice(0, MAX_TEXT),
    manifest: manifest.slice(0, MAX_TEXT),
    ...(truncated ? { truncated: true } : {}),
    revisions: matches.map((entry) => {
      const info = toSummary(entry.secret, entry.release);
      return {
        revision: info.revision,
        status: info.status,
        deployedAt: info.deployedAt,
        description: info.description,
        chart: info.chart,
      };
    }),
    resources: manifestResources(manifest),
    viewedRevision: Number(viewed.release.version ?? 1),
  };
}

/** Objects a rendered manifest creates, flattened out of the YAML text. */
function manifestResources(manifest: string): HelmManifestRef[] {
  if (!manifest.trim()) return [];
  let documents: unknown[];
  try {
    documents = loadAllYaml(manifest);
  } catch {
    return [];
  }
  const refs: HelmManifestRef[] = [];
  const push = (document: unknown) => {
    const object = document as Record<string, any> | null;
    if (!object || typeof object !== "object") return;
    if (object.kind === "List" && Array.isArray(object.items)) {
      for (const item of object.items) push(item);
      return;
    }
    if (!object.kind || !object.apiVersion) return;
    const name = object.metadata?.name;
    if (!name) return;
    refs.push({
      apiVersion: String(object.apiVersion),
      kind: String(object.kind),
      namespace: typeof object.metadata?.namespace === "string" ? object.metadata.namespace : undefined,
      name: String(name),
    });
  };
  for (const document of documents) push(document);
  return refs;
}

/** Reverse of the wire encoding: base64(base64(gzip(json))). */
function encodeRelease(release: ReleaseJson): string {
  const gzipped = gzipSync(Buffer.from(JSON.stringify(release), "utf8"), { level: 9 });
  return Buffer.from(gzipped.toString("base64"), "utf8").toString("base64");
}

export interface PreparedRollback {
  namespace: string;
  /** The target revision's stored manifest — re-applied to the cluster. */
  manifest: string;
  /** The new revision record to create after the manifest applied. */
  secret: {
    apiVersion: "v1";
    kind: "Secret";
    metadata: { name: string; namespace: string; labels: Record<string, string> };
    type?: string;
    data: Record<string, string>;
  };
  newRevision: number;
  targetRevision: number;
  secretName: string;
}

/**
 * Rollback without a Helm binary: copy the target revision's record as a NEW
 * revision (Helm's own model — history is append-only), and hand back its
 * stored manifest so the caller can re-apply it. Helm renders nothing here: the
 * manifest is what that revision actually deployed.
 */
export async function prepareHelmRollback(
  connection: ClusterConnection,
  request: { namespace: string; name: string; revision: number },
): Promise<PreparedRollback> {
  const secrets = await listSecrets(connection, request.namespace, "owner=helm");
  const matches: Array<{ secret: RawSecret; release: ReleaseJson }> = [];
  for (const secret of secrets) {
    const release = decodeRelease(secret);
    if (!release?.name || release.name !== request.name) continue;
    matches.push({ secret, release });
  }
  if (matches.length === 0) {
    throw new Error(`Helm release ${request.namespace}/${request.name} was not found in this cluster.`);
  }
  matches.sort((left, right) => Number(right.release.version ?? 1) - Number(left.release.version ?? 1));

  const target = matches.find((entry) => Number(entry.release.version ?? 1) === request.revision);
  if (!target) {
    throw new Error(`Revision ${request.revision} of ${request.name} does not exist in this cluster.`);
  }
  const current = matches[0];
  const newRevision = Math.max(...matches.map((entry) => Number(entry.release.version ?? 1))) + 1;

  const record: ReleaseJson = {
    ...target.release,
    version: newRevision,
    info: {
      ...(target.release.info ?? {}),
      status: "deployed",
      last_deployed: new Date().toISOString(),
      description: `Rolled back to revision ${request.revision}`,
    },
  };

  // Keep the existing naming scheme (`…<name>.v<revision>`) and labels, only
  // bumping what a new revision changes.
  const currentName = current.secret.metadata?.name ?? "";
  const baseName = currentName.replace(/\.v\d+$/, "");
  const secretName = `${baseName}.v${newRevision}`;
  const labels = { ...(current.secret.metadata?.labels ?? {}) };
  delete labels.version;
  labels.owner = "helm";
  labels.name = request.name;
  labels.status = "deployed";
  labels.version = String(newRevision);

  return {
    namespace: request.namespace,
    manifest: target.release.manifest ?? "",
    secret: {
      apiVersion: "v1",
      kind: "Secret",
      metadata: { name: secretName, namespace: request.namespace, labels },
      ...(current.secret.type ? { type: current.secret.type } : {}),
      data: { release: encodeRelease(record) },
    },
    newRevision,
    targetRevision: request.revision,
    secretName,
  };
}

export async function createReleaseSecret(
  connection: ClusterConnection,
  prepared: PreparedRollback,
): Promise<void> {
  const info = await connection.catalog.get("v1", "Secret");
  const apiPath = buildApiPath(info.apiVersion, info.plural, prepared.namespace);
  await kubeRequest(connection.kc, apiPath, { method: "POST", body: prepared.secret });
}
