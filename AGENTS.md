# AGENTS.md — working rules for mLens

This file is for AI coding agents and human contributors. Read it before changing
code. The product decisions live in `DESIGN_SPEC.md`; the technical contract in
`ARCHITECTURE.md`; the delivery status in `IMPLEMENTATION_PLAN.md`; the build
story and full context in `PROJECT_CONTEXT.md`.

---

## 1. What mLens is

A standalone Electron Kubernetes IDE written entirely in TypeScript/React.

**Non-negotiable product identity**

- **Application shell = Freelens.** Window chrome, cluster tabs, hotbar, catalog,
  sidebar tree, sibling resource tabs, bottom dock, right-side editor area with
  split panes, keyboard model, state preservation.
- **Kubernetes tooling = Radar.** Design tokens, fonts, icons, table density,
  filters, status language, details composition, logs, terminal surface.
- **Do not swap or blend these responsibilities.** A control's position and
  behaviour comes from Freelens; its visual language comes from Radar.

**Hard constraints**

- No Go, no Go backend, no separate server, no Docker.
- No `kubectl`, `helm`, Node.js or Go requirement for end users.
- Credentials never reach the renderer.
- No mock data in shipped features. If an integration is unavailable, say so.

---

## 2. Stack and process model

- Electron 45, React 19, TypeScript, Vite/electron-vite, Tailwind CSS v4,
  Zustand, xterm.js, node-pty, Monaco, `@kubernetes/client-node`.
- Main process (ESM) owns kubeconfigs, Kubernetes clients, discovery, watches,
  logs, exec WebSockets, port forwarding, PTYs, settings.
- Preload is CommonJS (`out/preload/index.cjs`) and exposes a fixed typed API
  (`window.mlens`). It never exposes `ipcRenderer`.
- Renderer is sandboxed (`sandbox: true`, `contextIsolation: true`,
  `nodeIntegration: false`).
- All IPC channels and payloads are declared in `src/shared/ipc.ts` and
  `src/shared/types.ts`; handlers are registered in `src/main/ipc/register.ts`.

**Never** import Electron or Node APIs in renderer feature code. Use `lib/api.ts`
or Zustand stores.

---

## 3. Repository map

```
src/main/
  index.ts                     lifecycle/window/menu
  ipc/register.ts              all ipcMain handlers
  settings/store.ts            JSON settings (0600), defaults, sanitisation
  kubernetes/
    kubeconfig.ts              sources, contexts, terminal kubeconfig export
    http.ts                    authenticated REST via RequestContext (exec auth)
    discovery.ts               /api, /apis, CRDs, printer columns
    session.ts                 ClusterConnection + ResourceCatalog
    cluster-manager.ts         list/get/counts/mutations/pod containers
    resource-watcher.ts        auto-reconnecting watches
    log-streams.ts             streaming logs
    exec-sessions.ts           exec WebSocket + resize
    port-forwards.ts           loopback TCP → Kubernetes port-forward WebSocket
  terminal/pty-manager.ts      local shells via node-pty
src/preload/                   contextBridge API
src/shared/                    domain types + IPC contract (no Node imports)
src/renderer/
  app-shell/                   Freelens shell: TopBar, ClusterTabs, Hotbar, etc.
  features/
    catalog/                   Welcome + cluster catalog + removal/restore
    navigation/                cluster sidebar, counts
    resource-browser/          Radar table, filters, columns, metrics, dialogs
    resource-details/          Radar details content + inner tabs + tray
    editor/                    VS Code-like editor area: panes, tab strips, splits
    port-forward/              start dialog + active forwards panel
    terminal/                  xterm view + dock
    settings/                  settings dialog
  design-system/
    styles/                    tokens.css, theme.css, themes.css, components.css
    components/                small primitives (Button, Badge, ResourceBar, …)
  lib/                         api, format, status, icons, catalog, columns, monaco
  stores/                      catalog-store, session-store
```

---

## 4. State rules

`session-store` holds one `ClusterSession` per cluster:

- `selectedNamespaces: string[]` (`[]` = all), selected kind, per-kind search,
  regex, sort, filters, hidden columns, expanded groups, sidebar width;
- `editor { panes, activePaneId, width, minimized, columnSplit, rowSplit }` —
  the VS Code-like editor area (1–4 panes in a 2×2 grid). Each pane keeps
  `tabs`, `active`, inner `tab` and a 25-entry `history`;
- `dock { open, height, tabs, activeTabId }`.

Resource-table sorting has two layers: the session keeps the current per-kind
choice, and every explicit sort is persisted in `settings.tableSorts` keyed by
`<apiVersion>|<kind>`. When a kind is opened for the first time (no saved sort),
the table defaults to **Age descending** — newest resources first. After that the
last explicit sort wins; a saved key that no longer exists for the kind is
ignored.

`catalog-store` holds settings, kubeconfig sources, `allClusters`, visible
`clusters`, health, active cluster, connect/disconnect, hidden clusters, and the
cross-cluster split (`splitClusterId`, `splitRatio`).

Important:

- **One mounted `ClusterWorkspace` per visited cluster**, hidden with CSS when
  inactive. Do not replace this with unmount-on-switch; terminal PTYs, scroll and
  drawer state must survive cluster switching.
- Never return a new array/object from a Zustand selector. Select stable slices
  (e.g. `state.sessions`, then `Object.keys` in render). Derived arrays in a
  selector cause React error #185 (infinite loop).
- Column widths and column order are **global settings**, keyed by
  `<apiVersion>|<kind>|<column>` and `<apiVersion>|<kind>`, so each kind tab keeps
  its own widths across clusters. The old `<kind>|<column>` key is still read as
  a fallback for widths saved before the split.
- Group expansion and favorite kinds are settings/session state, never local
  component state that resets on navigation.
- **Session selectors are field-level.** Subscribe to
  `state.sessions[clusterId]?.<field>` with a module-level constant as the
  fallback (`?? []` *inside* a selector allocates a new array on every
  notification — React #185), never to the whole session object: a
  keystroke-level write (`updateKindState`) must not re-render the workspace,
  sidebar and drawer. Cluster chrome that only renders status/info (ClusterTabs,
  Hotbar, CatalogPage, TerminalLauncher, SettingsDialog, AppShell) uses
  `useChromeSessions()` — a stable signature subscription with `getState()`
  reads.
- **Polled hooks keep their identity.** A fetch that found unchanged content
  returns the previous Map/array reference (`lib/stable.ts` — `sameMapValues`,
  `sameStringList`): timer ticks must not invalidate `cellContext` and the
  search/filter/sort memos downstream (A13).
- **Search and filtering are precomputed.** The haystack is a memo over
  `items/columns/cellContext` built only while a term is active, the term is
  debounced (`useDebouncedValue`), search + Problems + column filters run in
  one pass, and filter popover options are built lazily on open. Never
  reintroduce per-keystroke O(rows×cols) scans (A10–A11, A20).

---

## 5. Kubernetes rules

- One isolated `KubeConfig` per cluster session, with its own context.
- Every REST call goes through `kubeRequest`, which uses
  `RequestContext` + `applySecurityAuthentication` so tokens, client certs,
  basic auth and exec credential plugins work.
- Use discovery (`/api`, `/apis`, CRD list); never hard-code a closed list of
  supported kinds.
- Lists accept namespace scope; multi-namespace views fetch each scope and merge
  by UID. Watches are per scope and reconnect from the last resourceVersion.
  Client-side search and column filters cover the whole inventory: typing in the
  search box (or activating a filter) calls `useResourceList.loadAll()`, which
  follows every continue token (cap 20 pages) silently and reports progress in
  the footer. Don't "optimize" it back to the first page only.
- Counts use `limit=1` + `remainingItemCount`. Fetch counts only for the
  **resource page currently open** in the browser, plus **Nodes** and **CRD
  definitions**; never for expanded/collapsed sidebar groups, favorites or
  search results. Group headers show a resource total only when every listable
  kind in the group has been counted, otherwise the kind count. Poll at ≥120s.
- Metrics (`metrics.k8s.io`) are optional. Missing metrics must render `–`, never
  zero or invented values. Table metrics are fetched only when CPU/Memory columns
  are visible, at ≥60s.
- Mutations: delete asks for confirmation; scale = merge patch of `spec.replicas`;
  restart patches `spec.template.metadata.annotations`; pause/resume patches
  `spec.paused` (Deployments); suspend/resume patches `spec.suspend` (Jobs and
  CronJobs); YAML apply supports multi-doc/List and does dry-run before apply.
  Manual scaling is refused when an HPA owns the replica count (checked lazily on
  pressing Scale, not in the background).
- Port forwarding is implemented over the Kubernetes WebSocket protocol. The
  server sends the 2-byte little-endian port handshake on channels 0 and 1; the
  client strips it and does not send a port prefix. Do not replace this with a
  shell-out to kubectl. Starting a forward opens `http://127.0.0.1:<port>` in
  the system browser when `settings.portForwardOpenBrowser` is on (default);
  the start dialog exposes the checkbox.
- Terminal shells get a generated, context-pinned kubeconfig (0600) via
  `KUBECONFIG`; never modify the user's kubeconfig.
- Kubeconfig import accepts **any file** (the picker defaults to *All files*,
  no extension is trusted): the file is parsed and must declare at least one
  context. Invalid files are reported individually while valid selections are
  still added. Pasted YAML follows the same validation.

---

## 6. UI rules

- Follow Radar tokens: `bg-theme-base/surface/sidebar/elevated`, text tokens,
  `border-theme-border`, status classes, `.badge`, `.card-inner`, `.dialog`.
  Never use raw Tailwind gray/blue for themed surfaces.
- Typography: DM Sans / DM Mono. Table header 12px uppercase; rows 14px; details
  section text 13px; console/log text 11–13px monospace.
- Resource bars (`ResourceBar`) use Radar's **stacked** layout by default:
  `used / total` and the percentage above the track, never inline. Table CPU
  values are millicores (`2200m`, `formatCpuMilli`), memory is short (`851Mi`,
  `formatMemoryShort`). The `count` scheme (blue, amber above 90%) is for node
  pod counts — `allocatable.pods` is a Quantity, parse it with
  `parseQuantityCount` (`110`, `1k`), never with `parseCpu`. A pod's CPU/Memory
  tooltip is Radar's `buildContainerResourceTooltip` equivalent: containers
  sorted by percentage (top three), then `Node <name>` with
  `X% used · this pod Y%` (node usage/allocatable come from `useResourceMetrics`).
  CPU/Memory columns sort by **actual usage** (`value` reads
  `context.podMetrics` / `context.nodeMetrics`), never by requests/allocatable;
  missing samples are 0. Every Age surface uses `AgeProperty`/an Age tooltip with
  `creationTimestamp`.
- Connecting screen: a **circular** spinner (never a rounded square) over the
  cluster tile, a real three-step checklist driven by `ClusterSession.connectStage`
  (`api` → `namespaces` → `discovery` → `done`) with checkmarks/spinner/pending
  dots, a progress bar fed by `connectPercent`, and the percentage in the bottom
  row next to Cancel. Steps are set by `session-store.initialize()`, not faked in
  the component.
- Table: 44px rows by default (configurable 24–52), 40px header, fixed layout,
  always-visible selection checkbox, column resize (72px min), horizontal scroll,
  column visibility and order, filters/search/sort. The default column order ends
  with **Status, Age** for every kind; custom resources drop CRD printer columns
  that duplicate Age (`name: Age` or `.metadata.creationTimestamp`) because the
  generic Age column is always appended. A saved `settings.tableColumnOrder`
  still wins, so a user's own arrangement is remembered. Age is a compact 60px
  column (`compact: true` → `px-2`) and is appended for every discovered kind,
  Helm releases included.
- Table rows are a memoized `TableRow` (`ResourceTable.tsx`): layout values
  (`gridTemplate`, `stickyOffsets`, `effectiveWidths`) are memoized and
  row-level callbacks go through stable `latest`-ref wrappers — fresh inline
  closures handed to rows defeat the memo. The sidebar drag writes the width
  straight to the DOM (`rootRef` on the `<aside>`) and commits to the store
  once on `pointerup`; never call `setSidebarWidth` per pointermove.
- Logs render from a line array (`lines[]` + a partial tail, cap 20000 lines)
  through `@tanstack/react-virtual`; the stream flush moves buffered chunks
  into complete rows every 160ms. Do not go back to a monolithic `text` string
  (concat + `.slice(-1_500_000)` per flush) or an unvirtualized `lines.map` —
  chatty containers used to freeze the tab on ~30k DOM rows.
- The namespace scope picker lists **All namespaces** first, then the currently
  selected namespaces (after a separator), then the rest alphabetically. Search
  and the system-namespace toggle filter both groups. Clicking a namespace cell
  scopes the list; the **Namespace column stays visible even for a single
  namespace** so the table does not rebuild its columns under the cursor. Hide it
  through the column picker if it is noise. A namespace-scope change fetches
  **silently** — current rows stay until the new scope's page arrives, no spinner;
  only a kind/cluster change or the first load shows the loading state.
- Status: semantic tone only (`success/warning/error/info/neutral`). Use
  `resourceStatus` and `StatusBadge`; do not invent status strings ad hoc.
  Workloads say **Updating** (warning) while `observedGeneration` lags or
  replicas are still being replaced, **Not ready/Failed** (error) when nothing
  is serving or a condition failed; Pods expose the real blocker — Pending /
  ContainerCreating / PodInitializing / Terminating (warning) and
  CrashLoopBackOff / ImagePullBackOff / Evicted (error). Colours come from the
  tone, never from per-kind classes. Status badges (table and drawer) and
  condition cards explain themselves through the design-system `Tooltip`:
  `status.conditions` sorted newest-transition first, each with state,
  reason/message, relative age and the exact `lastTransitionTime`.
- Catalog: clusters with a live session (open) sort to the top; Status says
  **Connected**, not the Kubernetes version (version has its own column). A sort
  control offers open/status, name, recent and kubeconfig source; the choice is
  persisted as `settings.catalogSort`, and the Recent view always orders by
  `recentClusters`.
- Sidebar order (Freelens): Favorites, Nodes, Workloads, Config, Control, Network,
  Storage, Namespaces, Events, User Management, Helm, Custom Resources. Nodes/Namespaces/Events
  are direct rows. Config = workload configuration (ConfigMap/Secret/HPA/VPA/PDB/
  PriorityClass/PriorityLevelConfiguration/RuntimeClass/PodTemplate); Control =
  cluster machinery (Lease, APIService, ControllerRevision, CSR, FlowSchema,
  ResourceQuota, LimitRange, webhooks, admission policies). Custom Resources
  contains Definitions + one child per API group.
- **Helm releases are synthetic**: the sidebar group carries
  `HELM_RELEASES_RESOURCE`, and the browser/drawer read them through
  `kube:helm-list` / `kube:helm-get` (release Secrets parsed in main). Never
  send them to the Kubernetes API as a kind, never count them, and never offer
  Create/Delete for them — the `owner=helm` secrets are the source of truth.
  The drawer is read-only except Rollback: revision timeline with View, Compare
  (older→newer Manifest/Values diff), stored Release notes and Hooks, copy
  actions, and the manifest's Resources. `helmDetailRow` must carry
  `revisions`, `resources`, `viewedRevision`, `notes` and `hooks`; dropping them
  silently empties the history/resources sections. `YamlDiffEditor` opens at the
  first changed line (`revealFirstDiff`) and its diff colours come from
  `DIFF_COLORS` in `lib/monaco.ts` — Monaco's stock alpha is nearly invisible.
  Helm stores `hooks[].last_run` as an **object** (`started_at`, `completed_at`,
  `phase`), not a string; map it to `lastRun` and render the phase/timestamp, or
  React throws "Objects are not valid as a React child" and blanks the window.
  Installing/upgrading from a chart is deliberately absent — it needs Helm's Go
  template engine.
- Bulk **Annotate** (next to Delete selected) opens a checkbox dialog with every
  entry of `settings.annotationPresets`: tick any number of annotations, then one
  merge patch per resource writes them all. The list is edited behind
  "Manage annotations…". Applying annotations or a saved label **keeps the row
  selection**, so several presets can be stamped in a row.
- **Diff** (next to Copy names) is enabled only with exactly two selected rows of
  the same kind: a read-only Monaco side-by-side YAML diff, A = first selected
  row in table order, B = second. Both objects are re-read from the API; a toggle
  hides server-managed metadata (`uid`, `resourceVersion`, `generation`,
  `creationTimestamp`, `managedFields`). Never diff Helm releases — they only
  exist as parsed release secrets.
- **Compare across clusters** lives in the row ⋮ / context menu: "Select for
  comparison" pins a full `ResourceKey` in `catalogStore.compareSelection` (so it
  survives cluster switches), then another resource's "Compare with selected"
  opens the same diff dialog. A strip above the table names the pinned side and
  offers Clear. The dialog takes two `ResourceKey`s, so the sides may come from
  different clusters and be of different kinds.
- The details **YAML tab** hides server-managed metadata by default behind an
  "Ignore server metadata" checkbox (`lib/object-yaml.ts`: `uid`,
  `resourceVersion`, `generation`, `creationTimestamp`, `managedFields`,
  `selfLink`). The toggle is disabled while editing. Apply is unaffected: main
  merges the live metadata and reuses its `resourceVersion`, so a stripped
  document still updates the right object. YAML is serialized in a display order
  of `apiVersion`, `kind`, `metadata`, **`status`**, `spec`, then the remaining
  keys — status sits above spec, not buried under it.
- Custom resources and CRD definitions open on **Details** by default (Freelens
  field order); their Overview is still one click away and uses Radar-style cards.
- Details live in the **editor area** — a resizable column to the right of the
  table, not a modal and not a new window. Each pane has **Overview / Details /
  YAML / Events / Related / Logs (Pods only) / Metrics** tabs. Kind actions are
  labelled buttons in a
  right-aligned row under the resource name (Logs/Exec/Forward for Pods; Scale/Restart/Set image for
  workloads; Pause/Resume for Deployments; Suspend/Resume and Trigger for
  Jobs/CronJobs; Cordon/Uncordon, Drain and Debug shell for Nodes). Delete,
  Reload, Expand, Minimize and Close stay in the header; Delete sits next to
  Close and Expand sits before Minimize. Reload (clockwise
  arrow) only refetches data — Restart uses the counter-clockwise arrow. YAML
  and Related are tabs. Workload Scale also appears in the Overview Status
  section, as in Radar.
- Cluster tabs (open clusters) and editor tabs (open resources) are separate
  rows. Do not turn the app into a browser-style single tab bar. Cluster tabs
  reuse the editor-tab shape (rounded-t chip, top accent when active, close on
  hover) and keep their health dot. The table
  toolbar (Create, Search, live status, filters) spans the full content width;
  the editor area starts **under it**, aligned with the table header. It holds
  1–4 panes (2×2 max), each with its own VS Code-like tab strip:
  drag to reorder, drop onto another pane to move a tab, middle-click or the
  context menu to close (Close/Close others/Close to the right), Split right /
  Split down, and an overflow menu with every tab plus split actions. The area
  resizes on its left edge (down to a 240px table strip, so it can stretch much
  further left than the old drawer), expands over the table, and minimizes into
  the shadow tray above the dock; tabs stay open and clickable.
- Cross-cluster split: the **Columns2** button in the cluster tab strip pins a
  second open cluster, and two full `ClusterWorkspace`s render side by side.
  Workspaces stay in one keyed list; visibility/width use CSS (`hidden`,
  flex-grow, `order`) — never unmount one to split. The divider drags 20–80%,
  the active cluster is the left pane, clicking the right pane's cluster tab
  swaps roles, and closing either pane promotes the survivor. Both visible
  workspaces poll; hidden ones keep watches but stay paused.
- Hotbar: 10 slots **per page** on a 75px rail with 40px tiles and 12px spacing
  (Freelens), favourite clusters only, three-letter short names, seeded solid
  colours, status LED, drag/context-menu repositioning; never gradient avatars.
  The tile tooltip repeats the status as a dot plus Connected / Connecting… /
  Connection error / Not connected.
  Pages are Freelens-style: `‹ N ›` arrows plus a badge menu (switch / new /
  remove page, max 12), overflow favourites flow into later pages, and the tile
  list scrolls with a hover-only scrollbar. A favourite added from the catalog
  lands on the **active page**: Hotbar persists it into that page's first free
  slot instead of deriving it into page one.
- Terminal surface stays dark in every theme; Dracula/Freelens themes select the
  corresponding ANSI palette. Logs are Pod-only.
- Dock: the plus opens a local shell in the active context; the chevron and
  `⌘⇧T` open the context launcher (any connected cluster, namespace, pod exec,
  container, shell). Keep the one-click plus behaviour.
- Window dragging: the shell root is `-webkit-app-region: drag`, but the
  content pane (`main`), pane dividers, table rows, scroll areas, terminals and
  editors are `no-drag` so text can be selected/copied and panes resized.
  Dragging the window works from the shell chrome (top bar, hotbar rail,
  cluster tabs, status bar). Chrome labels are `user-select: none`; `main` and
  dialogs allow text selection.
- The editor area can be minimized without closing it: keep every pane's tabs,
  set `editor.minimized`, and restore from the tray above the dock.
- No huge components. Split table/controls/filters/dialogs/renderers.
- No dead buttons. If not implemented, label it explicitly.

---

## 7. Themes and design system

- Radar (default light/dark) — `styles/tokens.css` + `theme.css`.
- Dracula — `styles/themes.css` (`html.theme-dracula`), terminal palette in
  `TerminalView.tsx`.
- Freelens — `html.theme-freelens`, teal accent, Freelens terminal palette.
- Proton — `html.theme-proton`, slate/blue palette.
- Synthwave '84, Dark Islands, GitHub, Night Owl, Material, One Dark Pro,
  One Dark, Catppuccin (Mocha), Jellybeans, Adwaita — `html.theme-*` blocks in
  `styles/themes.css`, each with its own `mlens-*` Monaco theme and terminal ANSI
  palette. All are dark themes.
- Fonts: UI family is `settings.uiFontFamily` (DM Sans, Ubuntu, System UI) and is
  applied as an inline `--font-sans` override in `AppShell`; Ubuntu + Ubuntu Mono
  are bundled WOFF2 subsets under `design-system/fonts/` (`fonts.css`). Terminal
  families are listed in `lib/fonts.ts` (`TERMINAL_FONTS`). Any new theme must add
  a CSS block, a Monaco theme and a terminal palette.
- Theme classes are applied by `AppShell` from `settings.colorTheme`; **every
  theme except Radar forces dark mode**. Do not add theme-specific one-off
  component styles; extend tokens.

---

## 8. Commands

```bash
pnpm install         # postinstall heals node-pty +x and missing Electron runtime
pnpm dev             # electron-vite dev
pnpm typecheck       # tsc main+preload+shared and renderer
pnpm build           # typecheck + production build
pnpm dist:mac        # DMG + zip
pnpm dist:win        # NSIS
pnpm dist:linux      # AppImage + deb
```

Always run `pnpm typecheck` and `pnpm build` before declaring work done.

---

## 9. Known pitfalls (read before debugging)

1. **Electron main ESM**: use `import electron from "electron"` and destructure.
   Static named imports of main APIs can fail at link time and exit silently.
2. **Preload must stay CJS** (`out/preload/index.cjs`) because the renderer is
   sandboxed.
3. **node-pty spawn-helper** must be executable. `scripts/postinstall.cjs` handles
   skipped install scripts; if terminals print `posix_spawnp failed`, chmod the
   prebuild helper.
4. **pnpm v12** blocks install scripts; `pnpm-workspace.yaml` allowBuilds lists
   electron/node-pty, and excludes Electron 45.3.3 from minimum release age.
   Electron's runtime download *is* that install script: without
   `node_modules/electron/dist` + `path.txt`, `pnpm dev` dies with
   `Error: Electron uninstall`. The root postinstall (`scripts/postinstall.cjs`)
   now self-heals this on every `pnpm install` by running
   `node node_modules/electron/install.js`. It can still bite when
   `ELECTRON_SKIP_BINARY_DOWNLOAD` is set (the heal is skipped) or when the
   download fails — the postinstall then exits 1 with instructions. Manual cure
   unchanged: run `node node_modules/electron/install.js` once online, or re-run
   `pnpm install`; see README → Electron runtime.
5. **Zustand selectors returning new arrays** cause infinite loops (React #185).
6. **Hidden cluster workspaces** keep watches and mounted terminals; polling is
   disabled for inactive workspaces. Do not "optimize" by unmounting them.
7. **Port-forward protocol**: server sends the port handshake; client must not
   send it. Empty replies usually mean an extra prefix was sent.
8. **CSP** restricts workers to self/blob (Monaco) and connections to localhost.
9. **Metrics API** may be absent/forbidden; never substitute values.
10. **Catalog removal** is non-destructive (`settings.hiddenClusters`); never
    delete or rewrite the user's kubeconfig.
11. **Exec plugins need their binary on PATH.** A kubeconfig with
    `exec.command` (`kubectl oidc-login`, `aws`, `gke-gcloud-auth-plugin`, …) is
    spawned by `@kubernetes/client-node` inheriting main's env, and a GUI launch
    only gets launchd's minimal PATH — that was the `spawn kubectl ENOENT` bug.
    `src/main/path.ts` augments `process.env.PATH` before any authentication
    (inherited PATH + `/etc/paths`/`/etc/paths.d` + Homebrew prefixes + the
    login shell's PATH). Do not "fix" such errors by bundling kubectl: extend
    `augmentProcessPath` or surface the hint instead.
12. **TS quirk: a direct `.constructor === Foo` check on a cast object can
    collapse its type to `never`** (aliased-condition narrowing kicks in when
    the result is stored in a const and tested later). Compare through a local
    first: `const ctor = candidate.constructor; if (ctor === http.Agent) …` —
    see `reuseAgent` in `src/main/kubernetes/http.ts`.

---

## 10. Definition of done

- Typecheck + production build pass.
- Feature works against a real cluster, or clearly reports why it cannot.
- No mock data, no dead controls, no placeholder pages.
- Design follows Radar tokens/density; shell follows Freelens structure.
- State survives cluster switching and, where applicable, app restart.
- Docs updated when behaviour/settings/architecture change. Every change set gets
  its own `CHANGELOG.md` section `## vX.Y.Z — DD.MM.YYYY, HH:MM` (patch +1 from
  the previous heading; the timestamp is when the batch was finished) and the
  matching `package.json` version. There is no `Unreleased` section. Entries are
  user-facing and short — no internal refactors, perf notes, file names or
  verification logs.
- New IPC is in the shared contract and validated in main.
- Destructive actions confirm and never touch user kubeconfig files.
