import type { KubeConfig } from "@kubernetes/client-node";
import { HttpMethod, RequestContext } from "@kubernetes/client-node";
import http from "node:http";
import https from "node:https";

/**
 * A1: connection reuse. `applySecurityAuthentication` builds a fresh agent for
 * every request, and a fresh agent has `keepAlive: false` — so each kubeRequest
 * paid a full TCP + TLS handshake (counts polling, discovery and list refreshes
 * fire hundreds of calls). Agents are cached by their effective options (cluster
 * TLS config, proxy, exec-plugin client certs) and rebuilt with keep-alive, so
 * sockets are pooled per cluster configuration. A rotated client cert produces a
 * different key → a new agent; the cache is bounded so stale ones are dropped.
 */
const agentCache = new Map<string, http.Agent | https.Agent>();
const AGENT_CACHE_LIMIT = 24;

function reuseAgent(source: unknown): http.Agent | https.Agent | undefined {
  if (!source || typeof source !== "object") return undefined;
  const candidate = source as { options?: Record<string, unknown>; constructor: unknown };
  // Proxy agents (socks/https-proxy) take a different constructor signature:
  // keep client-node's instance as-is rather than risk rebuilding it wrong.
  // (Compare through a local: TS's aliased-condition narrowing on a direct
  // `.constructor ===` check collapses the object type to `never` here.)
  const ctor = candidate.constructor;
  const plain = ctor === http.Agent || ctor === https.Agent;
  if (!plain) return source as http.Agent | https.Agent;

  let key: string;
  try {
    key = JSON.stringify(candidate.options ?? {});
  } catch {
    return source as http.Agent | https.Agent;
  }
  const cached = agentCache.get(key);
  if (cached) return cached;

  const Ctor = ctor as typeof https.Agent;
  const agent = new Ctor({ ...(candidate.options ?? {}), keepAlive: true, keepAliveMsecs: 30_000 });
  agentCache.set(key, agent);
  if (agentCache.size > AGENT_CACHE_LIMIT) {
    const oldest = agentCache.keys().next().value;
    if (oldest !== undefined) agentCache.delete(oldest);
  }
  return agent;
}

/**
 * A5: drop server-managed bookkeeping from list/watch payloads — the UI never
 * renders `managedFields`, and it is the largest per-object overhead on big
 * inventories. Mutates in place; callers pass freshly parsed objects. `get`
 * keeps it so the YAML tab can still show server metadata explicitly.
 */
export function stripServerMetadata<T extends { metadata?: { managedFields?: unknown } }>(object: T): T {
  if (object.metadata && object.metadata.managedFields !== undefined) {
    delete object.metadata.managedFields;
  }
  return object;
}

export class KubeApiError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly reason?: string,
  ) {
    super(message);
    this.name = "KubeApiError";
  }
}

export interface KubeRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  rawBody?: Buffer | string;
}

export function buildApiPath(apiVersion: string, plural: string, namespace?: string): string {
  const base = apiVersion.includes("/") ? `/apis/${apiVersion}` : `/api/${apiVersion}`;
  const scope = namespace ? `/namespaces/${encodeURIComponent(namespace)}` : "";
  return `${base}${scope}/${plural}`;
}

export async function kubeRequest<T>(kc: KubeConfig, apiPath: string, options: KubeRequestOptions = {}): Promise<T> {
  const cluster = kc.getCurrentCluster();
  if (!cluster) throw new KubeApiError("No cluster is selected in this kubeconfig.");

  let url: URL;
  try {
    url = new URL(`${cluster.server.replace(/\/$/, "")}${apiPath}`);
  } catch {
    throw new KubeApiError(`Invalid Kubernetes API server URL: ${cluster.server}`);
  }

  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }

  const requestOptions: https.RequestOptions = {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json, */*",
      ...(options.body !== undefined || options.rawBody !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
    timeout: options.timeoutMs ?? 30_000,
  };

  // Build the same authenticated request context the generated Kubernetes
  // clients use. This resolves bearer tokens, basic auth and exec credential
  // plugins (EKS, GKE, AKS) and configures the TLS agent.
  const method = (options.method ?? "GET") as HttpMethod;
  const context = new RequestContext(url.toString(), method);
  await kc.applySecurityAuthentication(context);
  for (const [key, value] of Object.entries(context.getHeaders())) {
    (requestOptions.headers as Record<string, string>)[key] = value;
  }
  const agent = context.getAgent();
  if (agent) requestOptions.agent = reuseAgent(agent) ?? agent;

  const body =
    options.rawBody !== undefined
      ? options.rawBody
      : options.body !== undefined
        ? JSON.stringify(options.body)
        : undefined;
  if (body !== undefined) {
    requestOptions.headers = {
      ...requestOptions.headers,
      "Content-Length": Buffer.byteLength(body as Buffer | string),
    };
  }

  const transport = url.protocol === "https:" ? https : http;

  return await new Promise<T>((resolve, reject) => {
    const request = transport.request(url, requestOptions, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("error", reject);
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        const status = response.statusCode ?? 0;

        if (status >= 200 && status < 300) {
          if (!text) {
            resolve(undefined as T);
            return;
          }
          try {
            resolve(JSON.parse(text) as T);
          } catch {
            resolve(text as T);
          }
          return;
        }

        let message = text;
        let reason: string | undefined;
        try {
          const parsed = JSON.parse(text) as { message?: string; reason?: string; code?: number };
          message = parsed.message ?? text;
          reason = parsed.reason;
        } catch {
          // keep raw text
        }

        if (status === 401) message = `Authentication failed: ${message}`;
        else if (status === 403) message = `Access denied by RBAC: ${message}`;
        else if (status === 404) message = `Not found: ${message}`;

        reject(new KubeApiError(message || `Kubernetes API responded with ${status}`, status, reason));
      });
    });

    request.on("timeout", () => {
      request.destroy(new KubeApiError("Kubernetes API request timed out."));
    });
    request.on("error", (error) => {
      reject(
        error instanceof KubeApiError
          ? error
          : new KubeApiError(
              `Cannot reach the Kubernetes API: ${error.message}. Check the server address, VPN and certificates.`,
            ),
      );
    });

    if (body !== undefined) request.write(body);
    request.end();
  });
}

export function errorMessage(error: unknown): string {
  if (error instanceof KubeApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}
