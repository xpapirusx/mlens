import { Log } from "@kubernetes/client-node";
import { Writable } from "node:stream";
import type { LogChunkPayload, LogEndPayload, LogRequest } from "@shared/types";
import type { ClusterConnection } from "./session";

interface StreamHandle {
  closed: boolean;
  clusterId: string;
  abort?: AbortController;
  sink: Writable;
}

export class LogStreams {
  private readonly streams = new Map<string, StreamHandle>();

  constructor(private readonly getConnection: (clusterId: string) => ClusterConnection) {}

  async start(
    request: LogRequest,
    emitChunk: (payload: LogChunkPayload) => void,
    emitEnd: (payload: LogEndPayload) => void,
  ): Promise<void> {
    this.stop(request.streamId);

    const connection = this.getConnection(request.clusterId);
    const decoder = new TextDecoder("utf-8");
    let sink: Writable;

    const handle: StreamHandle = { closed: false, clusterId: request.clusterId, sink: null as unknown as Writable };
    sink = new Writable({
      write: (chunk: Buffer, _encoding, callback) => {
        if (!handle.closed) {
          emitChunk({ streamId: request.streamId, chunk: decoder.decode(chunk, { stream: true }) });
        }
        callback();
      },
    });
    handle.sink = sink;
    this.streams.set(request.streamId, handle);

    const finish = (error?: string) => {
      if (handle.closed) return;
      handle.closed = true;
      const tail = decoder.decode();
      if (tail) emitChunk({ streamId: request.streamId, chunk: tail });
      this.streams.delete(request.streamId);
      emitEnd({ streamId: request.streamId, error });
    };

    sink.on("error", (error: Error) => finish(error.message));
    sink.on("finish", () => finish());

    try {
      const log = new Log(connection.kc);
      handle.abort = await log.log(request.namespace, request.pod, request.container, sink, {
        follow: request.follow ?? true,
        previous: request.previous ?? false,
        tailLines: request.tailLines ?? 500,
        timestamps: request.timestamps ?? false,
      });
    } catch (error) {
      finish(error instanceof Error ? error.message : String(error));
    }
  }

  stop(streamId: string): void {
    const handle = this.streams.get(streamId);
    if (!handle) return;
    handle.closed = true;
    handle.abort?.abort();
    handle.sink.end();
    this.streams.delete(streamId);
  }

  stopAll(): void {
    for (const id of [...this.streams.keys()]) this.stop(id);
  }

  stopCluster(clusterId: string): void {
    for (const [id, handle] of this.streams) {
      if (handle.clusterId !== clusterId) continue;
      this.stop(id);
    }
  }
}
