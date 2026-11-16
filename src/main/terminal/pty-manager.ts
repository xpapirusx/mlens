import { spawn as spawnPty, type IPty } from "node-pty";
import os from "node:os";
import fs from "node:fs";
import type { LocalTerminalRequest, TerminalDataPayload, TerminalExitPayload } from "@shared/types";

interface PtyHandle {
  pty: IPty;
  closed: boolean;
}

function resolveShell(requested?: string): string {
  const candidates = requested
    ? [requested]
    : process.platform === "win32"
      ? [process.env.COMSPEC || "powershell.exe"]
      : [process.env.SHELL, "/bin/zsh", "/bin/bash", "/bin/sh"];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return process.platform === "win32" ? "powershell.exe" : "/bin/sh";
}

export class PtyManager {
  private readonly sessions = new Map<string, PtyHandle>();

  create(
    request: LocalTerminalRequest,
    emitData: (payload: TerminalDataPayload) => void,
    emitExit: (payload: TerminalExitPayload) => void,
  ): { shell: string } {
    this.close(request.sessionId);

    const shell = resolveShell(request.shell);
    const cwd = request.cwd && fs.existsSync(request.cwd) ? request.cwd : os.homedir();
    const args = process.platform === "win32" ? [] : ["-l"];

    const terminal = spawnPty(shell, args, {
      name: "xterm-256color",
      cols: Math.max(2, request.cols),
      rows: Math.max(2, request.rows),
      cwd,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        TERM_PROGRAM: "mLens",
        ...request.env,
      } as Record<string, string>,
    });

    const handle: PtyHandle = { pty: terminal, closed: false };
    this.sessions.set(request.sessionId, handle);

    terminal.onData((data) => {
      if (handle.closed) return;
      emitData({ sessionId: request.sessionId, data });
    });

    terminal.onExit(({ exitCode, signal }) => {
      if (handle.closed) return;
      handle.closed = true;
      this.sessions.delete(request.sessionId);
      emitExit({
        sessionId: request.sessionId,
        exitCode,
        error: signal ? `Process exited with signal ${signal}` : undefined,
      });
    });

    return { shell };
  }

  input(sessionId: string, data: string): void {
    this.sessions.get(sessionId)?.pty.write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const handle = this.sessions.get(sessionId);
    if (!handle) return;
    try {
      handle.pty.resize(Math.max(2, cols), Math.max(2, rows));
    } catch {
      // The process may have exited between the renderer fit and this call.
    }
  }

  close(sessionId: string): void {
    const handle = this.sessions.get(sessionId);
    if (!handle) return;
    handle.closed = true;
    try {
      handle.pty.kill();
    } catch {
      // already gone
    }
    this.sessions.delete(sessionId);
  }

  closeAll(): void {
    for (const id of [...this.sessions.keys()]) this.close(id);
  }
}
