import type { KubeConfig } from "@kubernetes/client-node";
import { HttpMethod, RequestContext } from "@kubernetes/client-node";
import http from "node:http";
import https from "node:https";

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
  if (agent) requestOptions.agent = agent;

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
