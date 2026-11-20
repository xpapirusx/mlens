#!/usr/bin/env node
/**
 * Evaluate arbitrary JavaScript in the running mLens renderer through the
 * Chrome DevTools Protocol. This is the debugging path used during profiling:
 * launch the built app with `--remote-debugging-port=9222`, then poke stores,
 * IPC APIs or DOM without rebuilding a debug UI.
 *
 * Usage:
 *   node scripts/debug-cdp.mjs "window.mlens.app.metrics()"
 *   node scripts/debug-cdp.mjs --file ./probe.js
 *   node scripts/debug-cdp.mjs --list
 *
 * Env: CDP_PORT (default 9222), CDP_HOST (default 127.0.0.1).
 */
import fs from "node:fs";
import WebSocket from "ws";

const host = process.env.CDP_HOST ?? "127.0.0.1";
const port = process.env.CDP_PORT ?? "9222";
const base = `http://${host}:${port}`;
const args = process.argv.slice(2);

function usage() {
  console.error(
    [
      "Usage: node scripts/debug-cdp.mjs <expression>",
      "       node scripts/debug-cdp.mjs --file <path>",
      "       node scripts/debug-cdp.mjs --list",
      "",
      "Start mLens with remote debugging first:",
      "  pnpm build",
      "  pnpm debug:app",
      "",
      "If the port never opens, an mLens instance is already running: the app is",
      "single-instance, so a second launch only focuses it and exits. Quit the",
      "running app (or use --user-data-dir=<tmp>) and launch again.",
    ].join("\n"),
  );
}

async function targets() {
  try {
    return await (await fetch(`${base}/json/list`)).json();
  } catch {
    throw new Error(
      `Cannot reach ${base}. Start mLens with --remote-debugging-port=${port} ` +
        `(pnpm debug:app). If another mLens is already running, quit it first — ` +
        `the app is single-instance and a second launch only focuses the first.`,
    );
  }
}

async function evaluate(expression) {
  const pages = (await targets()).filter((entry) => entry.type === "page");
  const page = pages.find((entry) => entry.url.includes("out/renderer")) ?? pages[0];
  if (!page) throw new Error("No renderer page target found.");

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let nextId = 0;
  const pending = new Map();
  ws.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });

  const result = await new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => reject(new Error("CDP evaluation timed out.")), 15_000);
    pending.set(id, (message) => {
      clearTimeout(timer);
      resolve(message);
    });
    ws.send(
      JSON.stringify({
        id,
        method: "Runtime.evaluate",
        params: {
          expression,
          awaitPromise: true,
          returnByValue: true,
          userGesture: true,
          includeCommandLineAPI: true,
        },
      }),
    );
  });
  ws.close();

  if (result.result?.exceptionDetails) {
    const details = result.result.exceptionDetails;
    throw new Error(details.exception?.description ?? details.text ?? "Evaluation failed.");
  }
  return result.result?.result?.value;
}

async function main() {
  if (args[0] === "--list") {
    const pages = await targets();
    for (const page of pages) {
      console.log(`${page.type}\t${page.title}\t${page.url}`);
    }
    return;
  }

  let expression;
  if (args[0] === "--file") {
    if (!args[1]) {
      usage();
      process.exitCode = 1;
      return;
    }
    expression = fs.readFileSync(args[1], "utf8");
  } else {
    expression = args.join(" ").trim();
  }
  if (!expression) {
    usage();
    process.exitCode = 1;
    return;
  }

  const value = await evaluate(expression);
  if (typeof value === "string") console.log(value);
  else if (value === undefined) console.log("undefined");
  else console.log(JSON.stringify(value, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
