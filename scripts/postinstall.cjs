/*
 * pnpm --ignore-scripts (and some CI installs) skip node-pty's postinstall,
 * which is what marks its bundled spawn-helper executable. Without +x,
 * spawning any local shell fails with "posix_spawnp failed".
 */
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
