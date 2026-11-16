import { Exec } from "@kubernetes/client-node";
import { PassThrough, Writable } from "node:stream";
import { TextDecoder } from "node:util";
import type { ExecRequest, TerminalDataPayload, TerminalExitPayload } from "@shared/types";
import type { ClusterConnection } from "./session";

/** Writable stdout that also exposes the terminal size Exec() reads for resize frames. */
class ResizableOutput extends Writable {
  rows = 24;
  columns = 80;

  constructor(private readonly onChunk: (chunk: Buffer) => void) {
    super();
  }

  _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.onChunk(chunk);
    callback();
  }

  resize(cols: number, rows: number): void {
    this.columns = cols;
    this.rows = rows;
    this.emit("resize");
  }
}

interface ExecHandle {
  closed: boolean;
  clusterId: string;
  stdin: PassThrough;
  output: ResizableOutput;
  socket?: { close: () => void };
  decoder: TextDecoder;
}

export class ExecSessions {
  private readonly sessions = new Map<string, ExecHandle>();

  constructor(private readonly getConnection: (clusterId: string) => ClusterConnection) {}

  async start(
    request: ExecRequest,
    emitData: (payload: TerminalDataPayload) => void,
    emitExit: (payload: TerminalExitPayload) => void,
  ): Promise<void> {
    this.close(request.sessionId);

    const connection = this.getConnection(request.clusterId);
    const decoder = new TextDecoder("utf-8");
    let handle: ExecHandle;

    const onChunk = (chunk: Buffer) => {
      if (!handle || handle.closed) return;
      const text = decoder.decode(chunk, { stream: true });
      if (text) emitData({ sessionId: request.sessionId, data: text });
    };

    const output = new ResizableOutput(onChunk);
    output.columns = request.cols;
    output.rows = request.rows;

    const stdin = new PassThrough();
    handle = { closed: false, clusterId: request.clusterId, stdin, output, decoder };
    this.sessions.set(request.sessionId, handle);

    const finish = (code: number | null, error?: string) => {
      if (handle.closed) return;
      handle.closed = true;
      const tail = decoder.decode();
      if (tail) emitData({ sessionId: request.sessionId, data: tail });
      this.sessions.delete(request.sessionId);
      emitExit({ sessionId: request.sessionId, exitCode: code, error });
    };

    const exec = new Exec(connection.kc);
    try {
      handle.socket = await exec.exec(
        request.namespace,
        request.pod,
        request.container,
        request.command.length ? request.command : ["/bin/sh"],
        output,
        output,
        stdin,
        request.tty,
        (status) => {
          finish(status?.code ?? 0, status?.message);
        },
      );

      // ws emits close(code, reason) when the connection drops without a status frame.
      const socket = handle.socket as unknown as {
        on?: (event: string, listener: (code?: number, reason?: Buffer) => void) => void;
      };
      socket.on?.("close", (code) => finish(code ?? 0));
    } catch (error) {
      finish(null, error instanceof Error ? error.message : String(error));
    }
  }

  input(sessionId: string, data: string): void {
    this.sessions.get(sessionId)?.stdin.write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.sessions.get(sessionId)?.output.resize(cols, rows);
  }

  close(sessionId: string): void {
    const handle = this.sessions.get(sessionId);
    if (!handle) return;
    handle.closed = true;
    handle.stdin.end();
    handle.socket?.close();
    this.sessions.delete(sessionId);
  }

  closeAll(): void {
    for (const id of [...this.sessions.keys()]) this.close(id);
  }

  closeCluster(clusterId: string): void {
    for (const [id, handle] of this.sessions) {
      if (handle.clusterId !== clusterId) continue;
      this.close(id);
    }
  }
}
