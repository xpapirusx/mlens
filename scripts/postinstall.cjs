/*
 * pnpm --ignore-scripts (and some CI installs) skip dependency postinstall steps,
 * so this root script re-applies the fixes those steps would have made:
 *
 *  - node-pty: its postinstall marks the bundled spawn-helper executable.
 *    Without +x, spawning any local shell fails with "posix_spawnp failed".
 *
 *  - electron: its postinstall downloads the runtime into dist/ + path.txt.
 *    Without it, `pnpm dev` dies with "Error: Electron uninstall".
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function ensureExecutable(file) {
  try {
    const mode = fs.statSync(file).mode;
    if ((mode & 0o111) === 0) fs.chmodSync(file, mode | 0o755);
  } catch {
    // not present on this platform
  }
}

function electronRuntimePresent(electronRoot) {
  return (
    fs.existsSync(path.join(electronRoot, "path.txt")) &&
    fs.existsSync(path.join(electronRoot, "dist"))
  );
}

function ensureElectronRuntime(electronRoot) {
  if (electronRuntimePresent(electronRoot)) return;

  if (process.env.ELECTRON_SKIP_BINARY_DOWNLOAD) {
    console.warn("[postinstall] ELECTRON_SKIP_BINARY_DOWNLOAD set; skipping Electron runtime download");
    return;
  }

  console.log("[postinstall] Electron runtime missing — downloading via electron's install.js …");
  const result = spawnSync(process.execPath, [path.join(electronRoot, "install.js")], {
    stdio: "inherit",
  });
  const spawnError = result.error ? ` (${result.error})` : "";
  const healed = result.status === 0 && electronRuntimePresent(electronRoot);
  if (!healed) {
    console.error(
      "[postinstall] Failed to download the Electron runtime" + spawnError + ".\n" +
        "Until it exists, `pnpm dev` will fail with \"Error: Electron uninstall\".\n" +
        "To fix, re-run `pnpm install` (repairs this and the node-pty electron-ABI rebuild),\n" +
        "or for the electron runtime only: `node node_modules/electron/install.js`."
    );
    process.exitCode = 1;
  }
}

try {
  const packageJson = require.resolve("node-pty/package.json");
  const root = path.dirname(packageJson);
  const prebuilds = path.join(root, "prebuilds");
  if (fs.existsSync(prebuilds)) {
    for (const platform of fs.readdirSync(prebuilds)) {
      ensureExecutable(path.join(prebuilds, platform, "spawn-helper"));
    }
  }
  ensureExecutable(path.join(root, "build", "Release", "spawn-helper"));
} catch (error) {
  console.warn("[postinstall] node-pty not found; skipping spawn-helper permissions");
}

try {
  const electronRoot = path.dirname(require.resolve("electron/package.json"));
  ensureElectronRuntime(electronRoot);
} catch (error) {
  console.warn("[postinstall] electron not found; skipping runtime check");
}
