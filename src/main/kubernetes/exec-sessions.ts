import { Attach, Exec } from "@kubernetes/client-node";
import { PassThrough, Writable } from "node:stream";
import { TextDecoder } from "node:util";
import type { ExecRequest, TerminalDataPayload, TerminalExitPayload } from "@shared/types";
import type { ClusterConnection } from "./session";

/** Kubernetes' status frame on channel 3. */
interface ExecStatus {
  status?: string;
  message?: string;
  reason?: string;
  details?: { causes?: Array<{ reason?: string; message?: string }> };
}

/**
 * The exec status frame is a `metav1.Status`: the process exit code lives in
 * `details.causes[reason=ExitCode]`, not in `code` (which is the HTTP-ish
 * status and usually absent). Reporting `code ?? 0` made every `exit 7` look
 * like a clean exit.
 */
function readExecStatus(status: ExecStatus | undefined): { exitCode: number | null; error?: string } {
  if (!status) return { exitCode: 0 };
  const cause = status.details?.causes?.find((entry) => entry.reason === "ExitCode");
  const parsed = cause?.message !== undefined ? Number(cause.message) : NaN;
  // A real process exit (including a non-zero one) carries an ExitCode cause.
  if (Number.isInteger(parsed)) return { exitCode: parsed };
  // Everything else is an API/runtime failure (missing binary, denied
  // subresource, container gone): there is no meaningful process exit code.
  if (status.status === "Failure") {
    return { exitCode: null, error: status.message ?? status.reason ?? "The exec session failed." };
  }
  return { exitCode: 0 };
}

/** ws surfaces some failures as an Error-like event instead of an Error. */
function socketErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return String(error);
}

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
      if (request.mode === "attach") {
        const attach = new Attach(connection.kc);
        handle.socket = await attach.attach(
          request.namespace,
          request.pod,
          request.container,
          output,
          output,
          stdin,
          request.tty,
        );
      } else {
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
            const result = readExecStatus(status as ExecStatus | undefined);
            finish(result.exitCode, result.error);
          },
        );
      }

      // ws emits close(code, reason) when the connection drops without a status frame.
      const socket = handle.socket as unknown as {
        on?: (event: string, listener: (code?: number, reason?: Buffer) => void) => void;
      };
      socket.on?.("close", (code) => finish(code ?? 0));
    } catch (error) {
      finish(null, socketErrorMessage(error));
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
