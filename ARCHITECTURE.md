# mLens — Architecture

**Status:** implemented prototype (v0.1.0). No Go, no external backend, no Docker.

mLens is a single Electron application. The main process owns every privileged
operation (kubeconfig files, TLS clients, Kubernetes watches, log streams, pod
exec WebSockets, PTYs, settings persistence). The renderer is a sandboxed React
app that talks to main only through a typed, allow-listed IPC bridge.

---

## 1. Process model

```
┌──────────────────────────── Electron main (Node/ESM) ───────────────────────────┐
│ app lifecycle · BrowserWindow · menu · settings.json                             │
│                                                                                  │
│  KubeconfigManager ──> ClusterManager ──> ClusterConnection (per cluster)        │
│                                │              ├── KubeConfig (isolated context)  │
│                                │              ├── DiscoveryService + cache      │
│                                │              └── ResourceCatalog               │
│                                ├── ResourceWatcher   (watch per table)          │
│                                ├── LogStreams        (pod log streams)          │
│                                └── ExecSessions      (pod exec WebSockets)      │
│                                                                                  │
│  PtyManager (node-pty) · SettingsStore (JSON, 0600)                             │
└───────────────────────────────────┬──────────────────────────────────────────────┘
                    contextBridge / ipcMain.handle + webContents.send
┌───────────────────────────────────▼──────────────────────────────────────────────┐
│ Preload (CJS, sandboxed) — window.mlens: MlensApi                                │
└───────────────────────────────────┬──────────────────────────────────────────────┘
┌───────────────────────────────────▼──────────────────────────────────────────────┐
│ Renderer (React 19, sandbox: true, contextIsolation: true, no Node integration)  │
│                                                                                  │
│  Zustand stores          App shell (Freelens)          Radar design system        │
│  ├── catalog-store       ├── TopBar / Hotbar          ├── tokens / theme          │
│  ├── session-store       ├── ClusterWorkspace         ├── table / badges / menus  │
│  └── toast               ├── Details drawer           └── Monaco / xterm          │
│                          └── Terminal dock                                      │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Why this split

- Kubeconfigs and exec credential plugins must run in a trusted process with file
  system and child-process access.
- The renderer never receives certificates, tokens, or arbitrary filesystem
  access. It receives only the Kubernetes objects and streams it needs.
- `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`; the
  preload exposes a **fixed API surface** and never a generic `ipcRenderer`.
- A Content-Security-Policy in `index.html` restricts scripts to self, styles to
  self + inline (Tailwind/Monaco), fonts/images to self/data/blob, and workers to
  self/blob (Monaco worker).

---

## 2. Repository layout

```
src/
  main/
    index.ts                     app lifecycle, BrowserWindow, menu
    ipc/register.ts              all ipcMain handlers (validation + wiring)
    settings/store.ts            JSON settings, sanitisation, change events
    kubernetes/
      kubeconfig.ts              sources, contexts, stable ids, paste import
      http.ts                    authenticated REST helper via RequestContext
      discovery.ts               /api, /apis, CRDs, printer columns, categories
      session.ts                 ClusterConnection + ResourceCatalog
      cluster-manager.ts         connect/disconnect, list/get, counts, mutations
      resource-watcher.ts        resilient watch loop (reconnects, bookmarks)
      log-streams.ts             pod log streaming with abort + text decoding
      exec-sessions.ts           Kubernetes exec WebSocket + resize
    terminal/pty-manager.ts      real local shells via node-pty
  preload/
    index.ts                     contextBridge implementation
    index.d.ts                   window.mlens typing
  shared/
    types.ts                     domain types (no Node/Electron imports)
    ipc.ts                       channel names + MlensApi contract
    keys.ts                      resource-count key format
  renderer/
    app-shell/                   Freelens-inspired chrome
    features/
      catalog/                   welcome + cluster catalog + paste import
      navigation/                cluster sidebar, resource counts
      resource-browser/          Radar-style table, filters, dialogs
      resource-details/          Radar-style drawer + renderers
      terminal/                  xterm view + terminal dock
      settings/                  settings dialog
    design-system/
      styles/                    tokens.css, theme.css, components.css
      components/                small reusable primitives
    lib/                         api, format, status, icons, columns, monaco
    stores/                      catalog-store, session-store
```

Constraints applied while building:

- No React component mixes Electron IPC with rendering logic; every call goes
  through `lib/api.ts` / Zustand stores.
- Components stay focused (the largest is the resource browser, which is split
  into table, controls, filter popover and dialogs).
- Shared domain types are importable from both processes and contain no runtime
  Electron/Node dependencies.

---

## 3. IPC contract

The full contract is `src/shared/ipc.ts` (`MlensApi`). Channels are constants, not
string literals scattered across the code.

| Namespace | Operations |
|---|---|
| `app` | version/platform info, open external URL, minimise/maximise/close, window state |
| `clusters` | list kubeconfigs + contexts, import file dialog, import path, import pasted YAML, remove source, connect, disconnect, health, namespaces |
| `resources` | discover, list (filters/paging), get, watch/unwatch, counts, delete, apply YAML, scale, restart, watch events |
| `pods` | container list |
| `logs` | start/stop stream, chunk/end events |
| `exec` | start, input, resize, close, data/exit events |
| `terminal` | create, input, resize, close, data/exit events |
| `settings` | get, update, changed event |

All handlers validate their input. Errors are ordinary `Error`s with messages
intended for humans; the renderer strips Electron's wrapper prefix in
`lib/api.ts`.

Streaming events are correlated by an opaque id (`subscriptionId`, `streamId`,
`sessionId`) generated by the renderer. Listeners filter by that id, so multiple
tables/terminals can stream concurrently.

---

## 4. Kubernetes integration

### 4.1 Kubeconfig catalog

`KubeconfigManager` reads the paths stored in settings. First launch seeds them
from `~/.kube/config` plus `KUBECONFIG` (path-delimiter separated, deduped,
existing files only). Each context becomes a cluster entry:

```
clusterId = `${absolute kubeconfig path}::${context name}`
```

This is stable, human-readable in logs, and lets the manager resolve the exact
file and context without a global "current context" side effect. The file is
never modified. Pasted kubeconfigs are validated, written under
`<userData>/kubeconfigs/<name>-<timestamp>.yaml` with mode `0600`, then added as
a source.

Favourites and recent clusters live in `<userData>/settings.json`.

### 4.2 Per-cluster connection

`ClusterManager.connect(id)` creates a **new `KubeConfig` instance**, loads only
that file, validates the context exists, and calls `setCurrentContext(context)`.
Connections are cached in `Map<clusterId, ClusterConnection>`; connecting is
idempotent. Each connection owns:

- its own `DiscoveryService` (5-minute cache) and `ResourceCatalog`;
- version/latency metadata;
- its own watcher/log/exec entries (tracked with the cluster id so a disconnect
  stops only that cluster's streams).

Concurrent clusters therefore cannot leak auth context into one another.

### 4.3 Authentication

Every request is built with the generated-client machinery so all kubeconfig auth
modes work without reimplementation:

```ts
const context = new RequestContext(url, method as HttpMethod);
await kubeConfig.applySecurityAuthentication(context);
// copy context.getHeaders() and context.getAgent() into node:https options
```

This covers bearer tokens, basic auth, client certificates, and **exec credential
plugins** (EKS/GKE/AKS `aws`, `gke-gcloud-auth-plugin`, `kubelogin`, etc.) via the
library's authenticators. CA data, `skipTLSVerify`, TLS server name and proxy URLs
are applied by the agent created in the same step. The renderer never sees any of
it.

### 4.4 Discovery and CRDs

Discovery is a TypeScript implementation of the standard flow:

1. `GET /api/v1` for the core group.
2. `GET /apis` for groups; fetch each preferred version's resource list.
3. `GET /apis/apiextensions.k8s.io/v1/customresourcedefinitions` once to mark
   CRDs, collect short names/categories and `additionalPrinterColumns`.
4. Drop subresources and non-listable kinds; dedupe by `group/kind`.
5. Assign catalog categories (workloads/network/config/…) or `custom:<group>`.

The result drives the sidebar, kind picker, tables and CRD printer columns. There
is no hard-coded “supported resources” list: a CRD installed a minute ago appears
after discovery refresh.

### 4.5 Lists, watches, counts

- **List**: raw REST with `limit`, `continue`, `labelSelector`, `fieldSelector`,
  scoped to a namespace when the kind is namespaced. 2000 items per page; the UI
  can append further pages.
- **Watch**: `@kubernetes/client-node` `Watch` on the same scope, with bookmarks.
  The watcher automatically reconnects from the last `resourceVersion` after
  server timeouts, and surfaces fatal errors to the UI. ADDED/MODIFIED/DELETED
  events are applied to the visible rows.
- **Polling**: independent reconcile interval from settings. This closes gaps
  after sleep/network loss even when a watch reports no error.
- **Counts**: `limit=1` plus `metadata.remainingItemCount`, six requests in
  parallel. A 150-kind cluster costs 150 tiny list calls instead of full lists.
  Failures are surfaced as “counts unavailable”, never as zero.

### 4.6 Mutations

- **Delete**: `DELETE` with `DeleteOptions` and background propagation.
- **Scale**: merge patch `spec.replicas`.
- **Restart**: merge patch of `spec.template.metadata.annotations` with
  `kubectl.kubernetes.io/restartedAt` (and an `mlens.io` marker).
- **Apply YAML**: multi-document parsing; `List` documents are flattened; each
  object is resolved through discovery (so CRDs work), then created with `POST`
  or replaced with `PUT` using the existing `resourceVersion`. `status` and
  `managedFields` are stripped. Dry run sends `dryRun=All`.
- **YAML edits** from the details drawer use the same apply path.

RBAC failures (401/403) and 404s are translated into clear messages. Write
controls are still shown for read-only users, but the server's error is presented
instead of silently doing nothing; capability-aware scoping is on the roadmap.

### 4.7 Logs

`Log.log(namespace, pod, container, writable, { follow, previous, tailLines,
timestamps })` writes to a `Writable` that forwards decoded UTF-8 chunks over IPC.
Stopping aborts the request. The viewer caps retained text at ~1.5 MB, buffers
chunks every 160 ms to avoid render storms, and only auto-scrolls while the user
is at the bottom.

### 4.8 Pod exec

`Exec.exec(...)` is used with a custom `Writable` stdout that exposes
`rows`/`columns` and emits `resize`; the library's `TerminalSizeQueue` turns those
events into `v4.channel.k8s.io` resize frames. stdin is a `PassThrough` fed by
xterm. Text is decoded with a streaming `TextDecoder` so multi-byte glyphs are not
split across chunks. Status frames and socket closes both terminate the session.

### 4.9 Local terminals

`PtyManager` spawns `$SHELL` (or configured shell) via node-pty with
`TERM=xterm-256color`, `COLORTERM=truecolor`, `TERM_PROGRAM=mLens`, a real cwd and
window size. Resize is forwarded; page reload/unmount closes the PTY.

node-pty's prebuilt `spawn-helper` must be executable; `scripts/postinstall.cjs`
enforces that because `pnpm --ignore-scripts` (used in some CI setups) skips
node-pty's own postinstall.

---

## 5. Renderer state model

Two Zustand stores:

### `catalog-store`

- settings (theme, refresh interval, terminal preferences, favourites, recents,
  kubeconfig paths, layout sizes);
- kubeconfig sources and context list;
- connection health per cluster;
- `activeClusterId` and connect/disconnect actions.

### `session-store`

One `ClusterSession` per cluster id. A session is created lazily and never
destroyed on cluster switch. It holds:

```ts
status, info, namespaces, resources (discovery),
namespace scope, selectedKind,
kindStates[apiVersion|kind] = { search, regex, sort, filters, hiddenColumns },
expandedGroups, sidebarWidth,
details { ref, tab } + detailsHistory,
dock { open, height, tabs, activeTabId }
```

This is the substitute for Freelens' per-cluster iframe heap. Everything the user
perceives as “my place in this cluster” lives here. Network/data caches are
deliberately not stored: list data is fetched live and reconciled by watch/poll.

Terminal tabs keep their xterm instance mounted while the dock is open, so
scrollback and long-running commands are not lost when switching tabs or
clusters.

---

## 6. UI layering and styling

- Tailwind CSS v4 with CSS-first tokens. Design tokens are plain CSS custom
  properties using `light-dark()`; `.dark` on `<html>` plus `color-scheme` drives
  the theme. `@theme inline` maps tokens to `bg-theme-*`, `text-theme-*`,
  `border-theme-*` utilities.
- No component library is used for the product UI. Primitives (Button, Badge,
  Tooltip, Menu, Modal, ContextMenu, Collapse, Tabs, SearchInput, Toast,
  EmptyState) are small local components.
- Monaco is bundled locally (no CDN) with its own worker; YAML highlighting is
  registered explicitly. CSP allows blob workers for it.
- xterm.js is bundled with fit/search/web-links addons.
- Icons are `lucide-react`; a single kind→icon map is shared by the sidebar,
  sibling tabs, details header and command palette.

---

## 7. Build and packaging

- **electron-vite** builds three targets:
  - main → ESM (`out/main/index.js`), externalising `@kubernetes/client-node`
    and node-pty;
  - preload → CommonJS (`out/preload/index.cjs`) because the preload runs
    sandboxed;
  - renderer → static files with hashed assets.
- `"type": "module"` makes the main bundle ESM. Electron's main-process `electron`
  module exposes named APIs only through its default export at runtime, so main
  uses `import electron from "electron"` and destructures once.
- **electron-builder** targets:
  - macOS: DMG + ZIP, arm64/x64, hardened runtime, entitlements for JIT and
    node-pty's native library;
  - Windows: NSIS, x64/arm64;
  - Linux: AppImage + deb.
- `npmRebuild: false`: node-pty 1.1 ships N-API prebuilds, ABI-stable across
  Electron versions. `node-pty` is unpacked from asar. Other platforms/arches'
  prebuilds are excluded at pack time.
- End users need no Node.js, Go, kubectl, Docker or separate backend. The
  installer contains Chromium, Node, the Kubernetes client, and the PTY bridge.

Commands:

```bash
pnpm install          # or npm install
pnpm dev              # electron-vite dev
pnpm typecheck        # main + renderer tsc
pnpm build            # typecheck + electron-vite build
pnpm dist:mac         # dmg + zip
pnpm dist:win         # nsis
pnpm dist:linux       # AppImage + deb
```

---

## 8. Security decisions

| Risk | Mitigation |
|---|---|
| Renderer compromise | `sandbox: true`, no Node integration, contextIsolation, fixed preload API |
| Arbitrary IPC | channel allow-list; input validation in every handler |
| Credential leakage | credentials stay in main; renderer receives only Kubernetes objects/log bytes |
| Malicious kubeconfig | parsed by the Kubernetes client; exec plugins run only because the user configured them locally; pasted files written 0600 |
| External navigation | `setWindowOpenHandler` denies popups; `http(s)` URLs open in the OS browser; `will-navigate` blocked |
| CSP | self-only scripts, blob workers for Monaco, no remote resources |
| Subprocesses | only node-pty (local shell) and exec credential plugins (explicitly configured by the kubeconfig) |
| Deletion | destructive actions are confirm dialogs; no auto-delete; apply requires explicit action |

Secrets are never rendered in tables. In the details drawer values are masked
until the user presses “Reveal” for a specific key.

---

## 9. Failure handling

- Connection errors are classified (auth, RBAC, DNS/TLS, timeout) into readable
  messages; the cluster workspace shows a retry/cancel screen.
- Discovery failures do not block the connection: the sidebar reports partial
  discovery.
- List errors appear inline with retry, never as an empty table.
- Watch errors downgrade the freshness indicator to polling; polling continues.
- Logs show connection state, stream errors and the exact pod/container.
- Metrics are hidden with an explicit “metrics.k8s.io not installed” message.
- Cluster disconnect stops only that cluster's watchers, log streams, exec
  sessions and (on window close) PTYs.

---

## 10. Key trade-offs

1. **No iframe-per-cluster.** Freelens gets isolation from separate origins and
   JS realms. mLens gets it from per-cluster `KubeConfig` instances in main and a
   keyed renderer session. This keeps the security model (`sandbox: true`,
   preload bridge) intact instead of enabling Node in subframes. The visible
   behaviour — preserved navigation/tabs when switching — is reproduced.
2. **No generic “resource tab” store.** Freelens uses sidebar routes, sibling
   tabs and a right drawer. mLens follows that: sibling tabs switch kinds; the
   drawer shows one resource at a time with a back stack. The dock is reserved
   for terminals, as in Freelens.
3. **Live data over caches.** Watches plus polling mean switching back to a
   cluster shows fresh data while UI state is restored instantly.
4. **Raw REST over generated typed APIs.** A small authenticated HTTP helper and
   discovery-driven paths let mLens support every built-in kind and every CRD
   without shipping hundreds of generated API modules. Typed objects are used
   only as an opaque `KubeObject` shape in the UI.
5. **Honest placeholders.** Anything not implemented is labelled, not faked:
   no mock clusters, metrics, or logs anywhere.

---

## 11. Extension points for the next stages

- **Port forwarding**: main-process `PortForward` from the Kubernetes client,
  surfaced as a dock tab.
- **Helm**: parse release secrets (`sh.helm.release.v1.*`) in TypeScript; no Helm
  binary needed.
- **Topology**: build a graph from owner references, selectors and service
  endpoints already fetched for Related.
- **Prometheus**: optional URL from settings; query range API for charts.
- **Capability-aware UI**: SelfSubjectAccessReview per namespace/kind to hide
  write actions instead of relying on server errors.
- **Multi-window**: create additional application windows sharing main-process
  cluster sessions; the renderer state is already keyed per cluster.
