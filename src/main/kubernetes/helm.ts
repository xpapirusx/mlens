import { gunzipSync } from "node:zlib";
import { dumpYaml } from "@kubernetes/client-node";
import { buildApiPath, kubeRequest } from "./http";
import type { ClusterConnection } from "./session";
import type {
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
  request: HelmReleaseRequest,
): Promise<HelmReleaseDetail> {
  // Not filtered by the `name` label: which labels a Helm version writes is
  // version-dependent, while the decoded record always carries the name.
  const secrets = await listSecrets(connection, request.namespace, "owner=helm");
  let best: { secret: RawSecret; release: ReleaseJson } | null = null;
  for (const secret of secrets) {
    const release = decodeRelease(secret);
    if (!release?.name || release.name !== request.name) continue;
    if (!best || Number(release.version ?? 1) > Number(best.release.version ?? 1)) {
      best = { secret, release };
    }
  }
  if (!best) {
    throw new Error(`Helm release ${request.namespace}/${request.name} was not found in this cluster.`);
  }

  const summary = toSummary(best.secret, best.release);
  let values = "";
  try {
    values = best.release.config ? dumpYaml(best.release.config) : "";
  } catch {
    values = "";
  }
  const manifest = best.release.manifest ?? "";
  const truncated = values.length > MAX_TEXT || manifest.length > MAX_TEXT;

  return {
    ...summary,
    values: values.slice(0, MAX_TEXT),
    manifest: manifest.slice(0, MAX_TEXT),
    ...(truncated ? { truncated: true } : {}),
  };
}
