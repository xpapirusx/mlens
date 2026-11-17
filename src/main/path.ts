import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * A GUI-launched macOS app gets launchd's minimal PATH (`/usr/bin:/bin:…`),
 * which does not contain Homebrew or `/usr/local/bin`. kubeconfigs with an
 * `exec` plugin (`kubectl oidc-login get-token …`, aws, gke-gcloud-auth-plugin)
 * spawn that binary through `@kubernetes/client-node`, and the spawn inherits
 * this process' env — so without the fix every such cluster fails with
 * `spawn kubectl ENOENT`, while the same kubeconfig works in a terminal.
 *
 * mLens never runs kubectl itself; this only puts directories that already
 * exist on the machine onto PATH, in three layers:
 *   1. immediately — whatever PATH the app inherited, plus `/etc/paths`,
 *      `/etc/paths.d/*` and the usual package-manager prefixes;
 *   2. shortly after — the PATH the user's login shell computes, which carries
 *      anything their rc adds (Homebrew shellenv, bun, mise, …).
 */

const EXTRA_PREFIXES = [
  "/opt/homebrew/bin",
  "/opt/homebrew/sbin",
  "/usr/local/bin",
  "/usr/local/sbin",
  "/opt/local/bin",
  path.join(os.homedir(), ".local/bin"),
  path.join(os.homedir(), "bin"),
];

function systemPathEntries(): string[] {
  const entries: string[] = [];
  const read = (file: string) => {
    try {
      for (const line of fs.readFileSync(file, "utf8").split("\n")) {
        const value = line.trim();
        if (value) entries.push(value);
      }
    } catch {
      // Missing file is normal (Linux, custom setups).
    }
  };
  read("/etc/paths");
  try {
    for (const name of fs.readdirSync("/etc/paths.d")) read(path.join("/etc/paths.d", name));
  } catch {
    // No /etc/paths.d.
  }
  return entries;
}

/** PATH as the user's login shell sees it; null on timeout or failure. */
function loginShellPath(): Promise<string | null> {
  const shell = process.env.SHELL || "/bin/zsh";
  if (!fs.existsSync(shell)) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    try {
      const child = spawn(shell, ["-l", "-c", 'printf %s "$PATH"'], {
        env: { ...process.env },
        stdio: ["ignore", "pipe", "ignore"],
      });
      let output = "";
      child.stdout?.on("data", (chunk: Buffer) => (output += chunk.toString("utf8")));
      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          // Already gone.
        }
        finish(null);
      }, 3000);
      child.on("error", () => {
        clearTimeout(timer);
        finish(null);
      });
      child.on("close", () => {
        clearTimeout(timer);
        finish(output.trim() || null);
      });
    } catch {
      finish(null);
    }
  });
}

function mergePath(...sources: Array<string | undefined>): void {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const source of sources) {
    if (!source) continue;
    for (const part of source.split(path.delimiter)) {
      if (!part || seen.has(part)) continue;
      seen.add(part);
      parts.push(part);
    }
  }
  process.env.PATH = parts.join(path.delimiter);
}

/** Call once at main-process startup, before any kubeconfig authentication. */
export function augmentProcessPath(): void {
  mergePath(process.env.PATH, systemPathEntries().join(path.delimiter), EXTRA_PREFIXES.join(path.delimiter));

  void loginShellPath().then((loginPath) => {
    // The login shell's own ordering wins (Homebrew before /usr/local, …),
    // so the binary the user's terminal resolves is the one we resolve.
    if (loginPath) mergePath(loginPath, process.env.PATH);
  });
}
