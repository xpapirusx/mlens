# mLens

**A desktop Kubernetes IDE.** Freelens' application structure, Kubernetes
tools and visual language — in one Electron app written entirely in TypeScript.

mLens is a standalone desktop program: no Go backend, no separate server, no
Docker, and no Node.js, kubectl or Helm installation required by the end user.

> Status: **v0.1.0 working prototype**. Clusters, discovery, resource tables,
> details, YAML, events, logs, local terminals and pod exec work against real
> Kubernetes clusters. Advanced views (Helm, topology, historical metrics) are
> not implemented yet and are marked as such in the UI.
> See [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md).

---

## What it looks like

- **Freelens shell:** one window, a cluster hotbar, a catalog/welcome page, a
  resource sidebar, sibling resource tabs, a right-side details drawer and a bottom
  terminal dock.
- **Radar tooling:** dense 44px tables with uppercase 12px headers, status badges,
  per-column filters, `/` search with regex, namespace scope, CRD columns,
  compact details tabs, dark console for logs/terminal, DM Sans + DM Mono.

Read the full rules in [`DESIGN_SPEC.md`](DESIGN_SPEC.md) and the internals in
[`ARCHITECTURE.md`](ARCHITECTURE.md).

---


## Getting started

### Requirements (development)

- Node.js 22+
- pnpm 10+ (npm also works, but the lockfile is pnpm)
- Xcode command line tools on macOS (for the node-pty prebuilt check)

```bash
pnpm install
node node_modules/electron/install.js
pnpm dev
```

`pnpm install` runs `scripts/postinstall.cjs`, which self-heals two known issues:
node-pty's bundled `spawn-helper` missing its executable bit (some installers
skip node-pty's own postinstall; without it terminals fail with
`posix_spawnp failed`) and a missing Electron runtime (see below).

#### Electron runtime

`electron` is a dev dependency, but its npm package only contains the launcher —
the ~100 MB platform binary is downloaded by the package's own postinstall into
`node_modules/electron/dist` (plus `path.txt`). pnpm v12 blocks install scripts
by default, so `pnpm-workspace.yaml` lists `electron` under `allowBuilds`.

A missing runtime is healed automatically: `pnpm install` runs
`scripts/postinstall.cjs`, which checks `node_modules/electron/path.txt` and
`dist/` and, if either is missing, runs `node node_modules/electron/install.js`
for you (~100 MB, cached in `~/Library/Caches/electron` on macOS after the first
download). A fresh clone + `pnpm install` therefore no longer ends in the
cryptic `Error: Electron uninstall` from electron-vite.

The failure can still happen — set `ELECTRON_SKIP_BINARY_DOWNLOAD` to skip the
heal, or run it offline. In that case `pnpm install` fails loudly with
instructions, or `pnpm dev` dies with:

```
Error: Electron uninstall
    at getElectronPath (... electron-vite/dist/chunks/lib-*.js ...)
```

Fix it manually (needs network):

```bash
node node_modules/electron/install.js   # downloads the runtime for this platform
pnpm dev
```

Or force the whole install/rebuild path:

```bash
pnpm rebuild electron
# or
rm -rf node_modules && pnpm install
```

Check the result: `node_modules/electron/path.txt` must exist and point at the
platform binary (on macOS `Electron.app/Contents/MacOS/Electron`). Behind a
corporate proxy or offline, set `ELECTRON_MIRROR` / `ELECTRON_GET_USE_PROXY`
before running the installer. A copied `node_modules` tree is not portable across
OSes or CPU architectures — after moving the project, prefer a fresh
`pnpm install`.

### Build

```bash
pnpm typecheck     # tsc for main/preload/shared and renderer
pnpm build         # typecheck + electron-vite production build
pnpm dist:mac      # DMG + ZIP (arm64/x64)
pnpm dist:win      # NSIS installer
pnpm dist:linux    # AppImage + deb
```

`electron-builder` packs Electron, the renderer, the TypeScript main process and
node-pty prebuilds into a normal desktop installer. Nothing else is required at
runtime. macOS builds are unsigned by default; when running a locally built DMG,
use right-click → Open the first time.

### Project layout

```
src/main          Electron main: kubeconfig, discovery, watch, logs, exec, pty
src/preload       contextBridge API (window.mlens)
src/shared        types + IPC contract shared by both sides
src/renderer
  app-shell       Freelens-style window chrome and workspace
  features        catalog, sidebar, resource browser, details, terminal, settings
  design-system   Radar-inspired tokens and primitives
  stores          Zustand catalog + session state
```

---

## Security

- `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`.
- The renderer gets a fixed, typed API — never `ipcRenderer` or filesystem access.
- Kubeconfig credentials, exec plugins, TLS material and PTYs stay in the main
  process.
- Strict CSP; popups are denied; HTTP(S) links open in the OS browser.
- Pasted kubeconfigs are written with `0600` permissions under the app data
  directory.

---

## Known limitations

- No extension system, Helm, topology, timeline or GitOps-specific views yet.
  CRDs (including Argo/Flux) appear under a nested Custom Resources tree as
  generic resources.
- Port forwarding is TCP loopback (127.0.0.1), one port per forward, no UDP.
- A kubeconfig that authenticates through an `exec` plugin (`kubectl oidc-login`,
  `aws`, `gke-gcloud-auth-plugin`, …) needs that binary installed — mLens never
  ships or runs kubectl itself, but it adds `/etc/paths`, Homebrew and your
  login-shell directories to PATH at startup so such plugins resolve; if the
  binary is genuinely missing the error says exactly that.
- Metrics are live metrics-server values only; no historical Prometheus charts.
- Forward navigation is disabled; back covers the details history and catalog.
- Write actions are not pre-filtered by RBAC; the Kubernetes error is shown when
  the action is denied.
- No automated test suite yet; the prototype is validated by typechecking,
  production builds, and manual smoke tests against real clusters (see the
  verification log in `IMPLEMENTATION_PLAN.md`).

---

## Licensing and attribution

mLens is MIT licensed (`LICENSE`).

- **Freelens** (MIT) inspired the application shell, window/tab/sidebar/dock
  mechanics. No Freelens source files are copied.
- **Skyhook Radar** (Apache-2.0) inspired the design system and Kubernetes UI
  patterns; token values and component recipes are adapted with attribution.
  The Apache license text is included in `licenses/Apache-2.0.txt`.
- Fonts (DM Sans, DM Mono) are OFL 1.1, loaded via `@fontsource` packages.
- Build story and full context: [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md).
- Agent/contributor rules: [`AGENTS.md`](AGENTS.md).
- Release history: [`CHANGELOG.md`](CHANGELOG.md).
- Full third-party notices: [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

mLens is an independent project and is not affiliated with Freelens, Skyhook, or
the Cloud Native Computing Foundation.


## Features

### Clusters

- Discovers contexts from `~/.kube/config` and `KUBECONFIG`.
- Imports additional kubeconfig files (file picker) or pasted YAML.
- Multiple kubeconfig sources, favourites and recent clusters. Open clusters sort
  to the top; Status reads **Connected** (version has its own column), with
  sorting by status, name, recent or kubeconfig source.
- Multi-select in the catalog: add to favourites, remove clusters from the mLens
  catalog (non-destructive — kubeconfig files are untouched) and restore them
  from the Removed view.
- Cluster tabs at the top; open-resource tabs inside a cluster.
- Concurrent cluster sessions; opening a cluster switches to its tab
  immediately and plays the connecting animation while discovery runs.
  Switching clusters preserves namespace scope,
  selected kind, search/sort/filters, sidebar state, open resource tabs and live
  terminal PTYs.
- Multiple namespace selection per cluster (all, one, or several). The picker
  keeps **All namespaces** on top, then the currently selected namespaces, then
  the rest alphabetically; search and the system-namespace toggle apply to both.
- Sidebar favorites (pinned resource kinds), collapsible groups starting folded
  by default, and a configurable table row height (24–52px).
- Health, latency, Kubernetes version, context and API server in the UI.
- Per-cluster **Overview** home page: nodes ready, pod/workload counts, warning
  events, CPU/memory capacity, API/CRD surface and quick links into kinds.
- Global resource search from the command palette (`⌘K`, debounced live search),
  `g`-prefix letter navigation, and a `?` keyboard-shortcut overlay.
- Connected clusters sort to the top of the catalog.
- Per-cluster isolation: each cluster has its own Kubernetes client/auth context
  in the main process.

### Resource browser

- Dynamic API discovery, including CRDs and their printer columns. Default
  columns end with **Status** then **Age**; a CRD's own `Age` printer column is
  dropped so it never appears twice, and a customised column order is remembered
  per kind. Age is a narrow 60px column with compact padding on every kind.
- Pods, Deployments, StatefulSets, DaemonSets, ReplicaSets, Jobs, CronJobs,
  Services, Ingresses, NetworkPolicies, ConfigMaps, Secrets, Nodes, Namespaces,
  Events, PV/PVC, StorageClasses, ServiceAccounts, Roles/Bindings,
  ClusterRoles/Bindings, HPAs, PDBs, CRDs and every served custom resource.
- Live watch + polling, freshness indicator, counts, search, sorting, per-column
  filters, namespace filters, sortable columns, drag-to-resize columns (double-click
  to reset), horizontal scrolling, column picker and keyboard navigation.
- Radar container squares in the Pods table (state colours, orange restart ring,
  init separator, tooltip with reason/exit code/uptime/last termination) and
  Radar Node columns (CPU/Memory usage bars, **Conditions** whose hover card
  lists every condition with state, reason and message, and a **Taints** count
  whose hover card lists every `key=value:effect`).
- CPU/Memory bars are Radar-style: the `used / total` row with the percentage
  sits **above** the track, CPU is always millicores (`2200m`) and memory uses
  short units (`851Mi`, `2.2Gi`). The Nodes table **Pods** column shows scheduled
  pods against `allocatable.pods` (`88 / 250`) in the same bar style. Hovering a
  pod's CPU/Memory bar opens Radar's breakdown: containers sorted by percentage
  (top three), each `used · % · limit/request`, then the node line
  `Node <name>` / `X% used · this pod Y%`. Sorting the CPU/Memory columns sorts
  by **actual usage** (metrics.k8s.io sample), not by requests; pods/nodes
  without a sample sort as zero.
- **Age** is a tooltip everywhere (table cell, drawer property and CR overview
  card) showing the exact creation timestamp.- Config / Access Control / Service columns follow Radar: a live **Endpoints**
  column for Services (Active / No endpoints / None / External), Type and
  External columns, ConfigMap **Size**, coloured Secret **Type** and TLS
  **Expires**, ServiceAccount **Automount**, Role/RoleBinding badges with an
  `sa:`/`grp:` subjects preview, and CRD **Kind** + **Status**.
- A **Warnings** column for Pods, workloads and Nodes shows the warning count
  with the latest Warning event in the tooltip (one event list per scope).
- A **Helm** group lists releases parsed from the `owner=helm` Secrets —
  status, chart, revision and app version — without a Helm binary. The release
  drawer adds the **revision timeline** (View any revision, **Compare** two
  revisions as a Monaco diff of stored Manifests or Values, **Rollback** which
  re-applies that revision's stored manifest and appends a new record), stored
  **Release notes** and **Hooks**, copy buttons for notes/values/manifests, and
  the **Resources** the manifest creates, each one clickable. Hooks show their
  phase and last run. A comparison opens scrolled to its first changed line, with
  strong green/red diff colours in every theme. Install/upgrade from a chart
  stays out of scope (no Helm template engine); only the stored release records
  are used.
- Multi-select mode with bulk delete and confirmation. **Annotate** opens a
  checkbox list of saved annotations and applies any number of them to every
  selected row; the selection stays after applying, so another preset can follow.
- **Diff** two selected resources of the same kind: side-by-side Monaco YAML
  comparison (A = first row in table order), with a toggle that hides
  server-managed metadata and a Swap action.
- **Compare across clusters** from the row ⋮ menu: "Select for comparison" pins a
  resource (the pin survives cluster switches and is shown above the table), then
  "Compare with selected" on another row opens the same diff — the two sides may
  be different kinds in different clusters.
- Sticky row-actions menu on the right of every row (same as right-click):
  details, edit YAML, logs, attach, exec shell (Pods), scale
  (Deployments/StatefulSets/ReplicaSets), restart
  (Deployments/StatefulSets/DaemonSets), pause/resume rollout (Deployments),
  suspend/resume (Jobs/CronJobs), set image (workloads, including init
  containers), trigger (CronJobs), cordon/uncordon and drain (Nodes), copy
  kubectl command, delete and force delete (`gracePeriodSeconds: 0`).
- Columns can be pinned to the left edge; open-resource tabs can be collapsed
  into a shadow tray above the terminal dock with every tab still clickable.
- The details drawer can be minimized (chevron) without closing anything: the
  open-resource tabs stay and a floating pill restores the drawer.
- Reference fields are clickable everywhere: owner references, `volumeName`,
  `claimRef`, `storageClassName`, `serviceAccountName`, HPA `scaleTargetRef`, …,
  plus the Controlled-by column and the PVC Pods/Volume/Storage-class columns.
- Init containers are marked in the Containers column (a hairline separator
  before the main containers and `init ·` in the tooltip) and listed in their
  own Pod Overview section.
- Custom resources and CRDs show their kind name in the sidebar (apiVersion in
  the tooltip); built-in kinds win over same-named CRDs. Opening a CR defaults the
  drawer to Details (Freelens field order); its Overview uses Radar-style cards
  with versions, printer columns and conditions.
- Create any discovered kind from YAML with server-side dry-run.

### Resource details

Overview / Details / YAML / Events / Related / Logs (Pods) / Metrics inside a
resizable Freelens-style drawer. The YAML tab hides server-managed metadata
(`uid`, `resourceVersion`, `generation`, `creationTimestamp`, `managedFields`,
`selfLink`) by default; the "Ignore server metadata" toggle shows the full stored
object, and Apply still merges the live object. Kind actions are labelled buttons in a
right-aligned row under the name (logs/exec/port-forward for Pods,
scale/restart/set image/pause/suspend/trigger for workloads, cordon/uncordon and
drain for Nodes); delete/reload/expand/close stay in the header, and reload only
refetches data. Drain shows a live plan (DaemonSet/mirror pods kept, emptyDir and
unmanaged pods flagged) and evicts through `policy/v1`. Pods show init containers and environment variables with inline
Secret/ConfigMap peeks; ConfigMaps and Secrets are editable from the UI (Secret
values decoded/encoded). Kind-specific Pod, workload, Service, Ingress, Node,
data, storage, HPA, CRD and generic CRD renderers; Node Overview uses Radar-style
capacity cards with an **In use** row, live usage, addresses, platform labels and
a live **Pods on this node** list, plus **Debug shell** (editable privileged-pod
manifest → apply → exec console, pod removed with the tab). Pod and workload
Overviews end with **Permissions via ServiceAccount** — direct and group-inherited
bindings, the distinct-rule count and a blast-radius warning — and with a
**Policy** section reading the cluster's PolicyReport families. Services get
load-balancer/no-selector banners and a live **Endpoints** section; Access
Control overviews show bindings, rule cards, subjects and used-by pods; TLS
Secrets show their certificate and expiry. Details carry the full clickable
**owner chain** (owner → owner's owner, scrollable) and an **editor for labels
and annotations** with a confirm step; the selection bar can stamp any number of
saved annotations onto every selected resource and keeps the selection afterwards. Related resources can be filtered
(search + regex + kind chips). Related resources are resolved from the live API for every kind.
Secrets reveal only on request.

### Terminal

- Real local shells through node-pty, in a bottom dock with tabs. The shell
  receives a context-pinned, 0600 KUBECONFIG for the open cluster (and its
  selected namespace), so `kubectl` starts on the right context.
- A **Create from YAML** dock tab (the `FileCode` button) takes one manifest or
  several separated by `---`, dry-runs and applies them through the same path as
  the Create dialog.
- Real Kubernetes pod exec over the exec WebSocket (no kubectl), with TTY resize.
- Port forwarding over the Kubernetes WebSocket protocol: loopback listener,
  live forwards panel, start/stop, and one-click port forwarding from the Pod
  Ports table, no kubectl process.
- xterm.js search, copy/paste, Radar console theme.

### Themes and layout

- Radar (light/dark/system), **Dracula**, **Freelens** and **Proton** (from
  luci-theme-proton2025) colour themes; each theme also selects its terminal
  ANSI palette and a Monaco theme.
- Hotbar with **pages** (75px rail, 10 slots per page, 40px cells, 12px spacing
  like Freelens): three-letter short names, seeded tile colours, a status LED,
  press/shake animations, drag-and-drop and a context-menu "Move to slot"
  fallback; `‹ N ›` switches pages and the badge opens the page list (new /
  remove page), favourites flow into the next page instead of being dropped,
  and the rail scrolls when the window is short. Open clusters stay in the top
  tab strip. Home/Back navigation lives in the tab strip.
- Reorderable sidebar groups, column order, column widths (remembered per kind
  across clusters), and configurable row height from 24 to 52px.
- Problems filter for warning/error statuses, plus the regular status badges and
  per-column status filters.
- Resource tables open **sorted by age, newest first**; an explicit sort is
  remembered per kind (Pods, CRDs, …) in settings and survives cluster switches
  and restarts, while a kind opened for the first time falls back to newest.
- Radar status language: Pods show their real blocker — Pending,
  ContainerCreating, PodInitializing, Terminating in amber; CrashLoopBackOff,
  ImagePullBackOff, ErrImagePull and Evicted in red; Running/Completed otherwise.
  Workloads show **Updating** in amber while a rollout is in progress and
  **Not ready** / **Failed** in red; the badge tooltip carries the
  ready/updated counts. Status badges with a detail (container message, node
  condition reason) explain themselves on hover; the card also lists the
  resource's `status.conditions`, newest transition first, with state,
  reason/message, relative age and the exact timestamp. In the details drawer the
  same card is on the header status badge, and a condition's age opens its exact
  transition time.

### Design system

Radar-derived tokens and components: cool blue-gray surfaces, one brand blue,
DM Sans/DM Mono, 6/8/10/14px radii, status hues (success/warning/alert/error/info),
`light-dark()` theming, 0.5px hairlines, compact badges, menus, tooltips, dialogs,
collapsible sections, YAML viewer and console.

---
