import { HttpMethod, RequestContext } from "@kubernetes/client-node";
import net from "node:net";
import WebSocket from "ws";
import type { PortForwardInfo, PortForwardRequest } from "@shared/types";
import type { ClusterConnection } from "./session";

interface ForwardHandle {
  info: PortForwardInfo;
  server: net.Server;
  sockets: Set<net.Socket>;
  tunnels: Set<WebSocket>;
}

function frame(channel: number, payload: Buffer): Buffer {
  return Buffer.concat([Buffer.from([channel]), payload]);
}

/**
 * Kubernetes WebSocket port-forward (v4.channel.k8s.io).
 *
 * A local loopback TCP listener is started for the requested local port. Every
 * accepted connection opens its own port-forward WebSocket, sends the 2-byte
 * target port header, and pipes bytes in both directions. No kubectl binary is
 * involved.
 */
export class PortForwardManager {
  private readonly forwards = new Map<string, ForwardHandle>();

  constructor(private readonly getConnection: (clusterId: string) => ClusterConnection) {}

  list(): PortForwardInfo[] {
    return [...this.forwards.values()].map((handle) => handle.info).sort((a, b) => b.startedAt - a.startedAt);
  }

  async start(request: PortForwardRequest): Promise<PortForwardInfo> {
    const connection = this.getConnection(request.clusterId);
    const server = net.createServer();
    const explicitPort = request.localPort && request.localPort > 0 ? request.localPort : undefined;
    const randomPort = () => 30000 + Math.floor(Math.random() * (65355 - 30000 + 1));

    const listen = (port: number) =>
      new Promise<void>((resolve, reject) => {
        const onError = (error: NodeJS.ErrnoException) => {
          server.off("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          server.off("error", onError);
          resolve();
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, "127.0.0.1");
      });

    let attempts = 0;
    for (;;) {
      const port = explicitPort ?? randomPort();
      try {
        await listen(port);
        break;
      } catch (error) {
        attempts += 1;
        const code = (error as NodeJS.ErrnoException).code;
        if (explicitPort || code !== "EADDRINUSE" || attempts >= 12) {
          throw new Error(`Cannot listen on 127.0.0.1:${port}: ${(error as Error).message}`);
        }
      }
    }

    const address = server.address();
    if (!address || typeof address === "string") {
      server.close();
      throw new Error("Cannot determine the local port.");
    }

    const info: PortForwardInfo = {
      id: `pf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      clusterId: request.clusterId,
      namespace: request.namespace,
      pod: request.pod,
      remotePort: request.remotePort,
      localPort: address.port,
      startedAt: Date.now(),
    };

    const handle: ForwardHandle = { info, server, sockets: new Set(), tunnels: new Set() };
    this.forwards.set(info.id, handle);

    server.on("connection", (socket) => {
      handle.sockets.add(socket);
      socket.on("close", () => handle.sockets.delete(socket));
      void this.openTunnel(connection, handle, socket).catch((error) => {
        socket.destroy(error instanceof Error ? error : undefined);
      });
    });

    return info;
  }

  private async openTunnel(
    connection: ClusterConnection,
    handle: ForwardHandle,
    socket: net.Socket,
  ): Promise<void> {
    const cluster = connection.kc.getCurrentCluster();
    if (!cluster) throw new Error("Cluster has no API server.");

    const apiUrl = new URL(cluster.server);
    apiUrl.pathname = `/api/v1/namespaces/${encodeURIComponent(handle.info.namespace)}/pods/${encodeURIComponent(handle.info.pod)}/portforward`;
    apiUrl.search = new URLSearchParams({ ports: String(handle.info.remotePort) }).toString();

    // RequestContext only accepts absolute http(s) URLs; build the WebSocket URL
    // from the same path afterwards.
    const context = new RequestContext(apiUrl.toString(), HttpMethod.GET);
    await connection.kc.applySecurityAuthentication(context);
    const headers = context.getHeaders();
    const agent = context.getAgent();

    const wsUrl = new URL(apiUrl.toString());
    wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
    const tunnel = new WebSocket(wsUrl.toString(), ["v4.channel.k8s.io"], { headers, agent });
    handle.tunnels.add(tunnel);

    const portHeaderStripped = [false, false];

    tunnel.on("open", () => {
      // The API server sends the port handshake; the client only sends payload
      // frames on channel 0.
      socket.on("data", (chunk) => {
        if (tunnel.readyState === WebSocket.OPEN) tunnel.send(frame(0, Buffer.from(chunk)));
      });
    });

    tunnel.on("message", (raw: Buffer | ArrayBuffer | Buffer[]) => {
      const data = Buffer.isBuffer(raw) ? raw : Array.isArray(raw) ? Buffer.concat(raw) : Buffer.from(raw);
      if (data.length < 1) return;
      const channel = data[0];
      let payload = data.subarray(1);
      if ((channel === 0 || channel === 1) && !portHeaderStripped[channel] && payload.length >= 2) {
        payload = payload.subarray(2);
        portHeaderStripped[channel] = true;
      }
      if (channel === 0) {
        if (payload.length > 0) socket.write(payload);
      } else if (channel === 1) {
        const message = payload.toString("utf8").trim();
        if (message) socket.destroy(new Error(message));
      }
    });

    tunnel.on("error", (error) => {
      socket.destroy(error);
    });

    tunnel.on("close", () => {
      handle.tunnels.delete(tunnel);
      socket.end();
    });

    socket.on("error", () => tunnel.close());
    socket.on("close", () => tunnel.close());
  }

  stopCluster(clusterId: string): void {
    for (const [id, handle] of this.forwards) {
      if (handle.info.clusterId === clusterId) this.stop(id);
    }
  }

  stop(id: string): void {
    const handle = this.forwards.get(id);
    if (!handle) return;
    for (const socket of handle.sockets) socket.destroy();
    for (const tunnel of handle.tunnels) tunnel.close();
    handle.server.close();
    this.forwards.delete(id);
  }

  closeAll(): void {
    for (const id of [...this.forwards.keys()]) this.stop(id);
  }
}
