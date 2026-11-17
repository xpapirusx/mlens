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
      port-forwards.ts           loopback TCP → Kubernetes port-forward WebSocket
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
      resource-details/          Radar-style drawer, resource tabs + renderers
      port-forward/              start dialog + active forwards panel
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
| `rbac` | effective ServiceAccount permissions (direct + group-inherited bindings, flattened rules) and the reverse lookup by Role/ClusterRole (bindings + rules) |
| `policy` | per-resource policy findings read from the cluster's PolicyReport / ClusterPolicyReport families |
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

### 4.5 Multiple namespace scopes

A session stores `selectedNamespaces: string[]`; empty means all namespaces. The
renderer fetches each scope independently and merges rows by UID, starts one
watch per scope, and sums sidebar counts per kind. Exactly one selected namespace
is a normal paged list with a resourceVersion watch; several namespaces hide the
paging control and cap each scope at 1000 rows for the first iteration. The
Namespace column is shown whenever the scope is not exactly one namespace.

### 4.6 Lists, watches, counts

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

### 4.7 Mutations

- **Delete**: `DELETE` with `DeleteOptions` and background propagation; force
  delete adds `gracePeriodSeconds: 0`.
- **Scale**: merge patch `spec.replicas`.
- **Restart**: merge patch of `spec.template.metadata.annotations` with
  `kubectl.kubernetes.io/restartedAt` (and an `mlens.io` marker).
- **Pause / resume rollout**: merge patch `spec.paused` (Deployments).
- **Suspend / resume**: merge patch `spec.suspend` (Jobs and CronJobs).
- **Cordon / uncordon**: merge patch `spec.unschedulable` (Nodes).
- The renderer refuses manual scaling when a HorizontalPodAutoscaler targets the
  workload; the HPA list is read lazily on pressing Scale, never in the background.
- **Apply YAML**: multi-document parsing; `List` documents are flattened; each
  object is resolved through discovery (so CRDs work), then created with `POST`
  or replaced with `PUT` using the existing `resourceVersion`. `status` and
  `managedFields` are stripped. Dry run sends `dryRun=All`.
- **YAML edits** from the details drawer use the same apply path.

RBAC failures (401/403) and 404s are translated into clear messages. Write
controls are still shown for read-only users, but the server's error is presented
instead of silently doing nothing; capability-aware scoping is on the roadmap.

### 4.8 Logs

`Log.log(namespace, pod, container, writable, { follow, previous, tailLines,
timestamps })` writes to a `Writable` that forwards decoded UTF-8 chunks over IPC.
Stopping aborts the request. The viewer caps retained text at ~1.5 MB, buffers
chunks every 160 ms to avoid render storms, and only auto-scrolls while the user
is at the bottom.

### 4.9 Pod exec and attach

`Exec.exec(...)` is used with a custom `Writable` stdout that exposes
`rows`/`columns` and emits `resize`; the library's `TerminalSizeQueue` turns those
events into `v4.channel.k8s.io` resize frames. stdin is a `PassThrough` fed by
xterm. Text is decoded with a streaming `TextDecoder` so multi-byte glyphs are not
split across chunks. Status frames and socket closes both terminate the session.

Attach uses the same session plumbing with `Attach.attach(...)` and no command:
`term.mode = "attach"` streams the running process (tty off), while exec opens an
interactive shell with tty on. The drawer exposes both, and the dock renders them
identically.

### 4.10 Local terminals and cluster context

`PtyManager` spawns `$SHELL` (or configured shell) via node-pty with
`TERM=xterm-256color`, `COLORTERM=truecolor`, `TERM_PROGRAM=mLens`, a real cwd and
window size. Resize is forwarded; page reload/unmount closes the PTY.

For a cluster terminal, `KubeconfigManager.writeTerminalKubeconfig()` exports a
copy of the resolved kubeconfig with `current-context` and (when exactly one
namespace is selected) the context namespace applied, writes it mode `0600`
under `<userData>/terminal-kubeconfigs`, and injects `KUBECONFIG`,
`MLENS_CLUSTER` and `MLENS_NAMESPACE` into the PTY environment. The user's own
kubeconfig is never modified. This is the same user-visible behaviour as
Freelens' per-cluster terminal, without a proxy binary.

### 4.11 Metrics for tables

`useResourceMetrics` reads `metrics.k8s.io/v1beta1` `PodMetrics`/`NodeMetrics`
for the current namespace scope (Pod tables) or cluster-wide (Node tables), maps
samples by `namespace/name` and by node name, and refreshes at the table poll
interval. CPU/memory cells aggregate container usage and compare it with summed
requests/limits from the Pod spec (request marker), or show node usage against
allocatable for Nodes. Missing metrics render `–`; there is no fallback to
synthetic numbers. The whole metrics query is skipped when the metrics API is not
discovered or the workspace is hidden.

### 4.12 Related resources

`useRelatedResources` resolves relationships on demand when the Related tab is
open: owner references, label selectors (services ↔ pods, workloads → pods),
ReplicaSet revisions, CronJob-created Jobs, pod-referenced ConfigMaps/Secrets,
node-scoped pods and bound PVs. Every list is read through the same authenticated
REST path; RBAC failures are reported as warnings instead of inventing links.

### 4.13 Port forwarding

`PortForwardManager` implements the Kubernetes WebSocket port-forward protocol
(`v4.channel.k8s.io`) directly:

1. A `net.Server` listens on `127.0.0.1:<local>` (0 = free port).
2. Every accepted TCP connection opens a WebSocket to
   `/api/v1/namespaces/<ns>/pods/<pod>/portforward?ports=<remote>`.
3. Auth and TLS come from the same `RequestContext` path as REST requests.
4. The server sends a channel+2-byte-little-endian-port handshake on channels 0
   (data) and 1 (errors); the client strips it and forwards raw bytes, prefixing
   outgoing data with the channel byte only.
5. Stop closes the listener, sockets and tunnels; cluster disconnect stops only
   that cluster's forwards; app quit stops all.

No kubectl process and no SPDY implementation are involved. Limits: TCP only,
one port per forward, loopback bind.

### 4.14 Policy reports

`policyResource(connection, { kind, namespace, name })` answers "what does this
cluster's policy engine say about this resource". Discovery decides which
families exist (`PolicyReport` and `ClusterPolicyReport` in any group, so both
`wgpolicyk8s.io` and the newer `reports.k8s.io` are covered); namespaced
reports are read in the resource's namespace, cluster reports cluster-wide.
Results whose `subject` matches kind/name/namespace are counted per result
value and the notable ones (everything except `pass`) are returned as findings.

States are explicit, because an empty answer means several unrelated things:
no report kinds discovered → `not_installed` (the section renders nothing);
every family denied → `deferred` + `rbac_denied` (a calm note); a genuine list
fault → thrown, so the section shows the error; zero matches → "no policy
applies". A family that could not be read while others could is reported in
`deniedGroups`, which suppresses the word "All" from the passing claim.

### 4.15 RBAC reverse lookup

`rbacSubject(connection, { namespace, name })` answers "what can this
ServiceAccount actually do": it lists Roles, ClusterRoles, RoleBindings and
ClusterRoleBindings (paged, `limit=500`, up to 20 pages), resolves each binding
to its rules, and reports

- `direct` — bindings whose subject is the ServiceAccount;
- `inheritedFromGroups` — bindings that reach it through the implicit groups
  every ServiceAccount belongs to (`system:authenticated`,
  `system:serviceaccounts`, `system:serviceaccounts:<ns>`), each tagged with
  the group that brought it in;
- `flat` — deduplicated rules across both, capped at 500 with `truncated`;
- `scopeNamespace` when a RoleBinding points at a ClusterRole, so the UI never
  presents a namespace-scoped grant as cluster-wide.

The four cluster lists are cached per cluster for 10 seconds (a failed fetch is
not cached), so opening several Pods costs one burst. The renderer shows the
result as the "Permissions via ServiceAccount" section on Pod and workload
Overviews; a 403 is rendered as a calm note rather than an error, because
reading RBAC is a bonus feature.

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

Settings add `tableRowHeight` (24–52), `collapseCatalogGroups` (default true),
`favoriteKinds` (pinned sidebar kinds) and `hiddenClusters` (catalog removal).

The synthetic kind `{ apiVersion: "", kind: "__overview__" }` selects the
per-cluster Overview page. It is the default selected kind after connecting, is
rendered by `features/overview/ClusterOverview.tsx` instead of a table, and is
filtered out of sibling tabs and the kind lookup. The page reads only cheap
counts (`limit=1`), one Node list and the 20 most recent Warning events while it
is visible; it adds no watchers.
Removing a cluster only drops it from the visible catalog: the kubeconfig file is
never modified. Hidden sessions are disconnected and disposed, and the Removed
view can restore contexts without touching Kubernetes. The cluster catalog uses
the same always-visible checkbox selection as resource tables.

This is the substitute for Freelens' per-cluster iframe heap. Everything the user
perceives as “my place in this cluster” lives here. Network/data caches are
deliberately not stored: list data is fetched live and reconciled by watch/poll.

Freelens preserves cluster state by keeping every cluster iframe alive. mLens
does the equivalent in React: `AppShell` mounts one `ClusterWorkspace` per
visited session and hides inactive ones with `display: none`. The cluster tab
strip switches those workspaces; the open-resource strip switches the active
drawer tab within a workspace. Hidden workspaces
keep their tables, scroll positions, drawers and terminal xterm instances
mounted; polling is disabled while inactive, but watch streams stay connected.
Terminal tabs are therefore never unmounted on a cluster switch, so running
shells and pod exec sessions survive until the user closes the tab or
disconnects the cluster.

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

- **Helm**: parse release secrets (`sh.helm.release.v1.*`) in TypeScript; no Helm
  binary needed.
- **Topology**: build a graph from owner references, selectors and service
  endpoints already fetched for Related.
- **Prometheus**: optional URL from settings; query range API for charts.
- **Capability-aware UI**: SelfSubjectAccessReview per namespace/kind to hide
  write actions instead of relying on server errors.
- **Multi-window**: create additional application windows sharing main-process
  cluster sessions; the renderer state is already keyed per cluster.
