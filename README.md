# mLens

**A desktop Kubernetes IDE.** Freelens' application structure, Radar's Kubernetes
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

## Features

### Clusters

- Discovers contexts from `~/.kube/config` and `KUBECONFIG`.
- Imports additional kubeconfig files (file picker) or pasted YAML.
- Multiple kubeconfig sources, favourites and recent clusters.
- Multi-select in the catalog: add to favourites, remove clusters from the mLens
  catalog (non-destructive — kubeconfig files are untouched) and restore them
  from the Removed view.
- Cluster tabs at the top; open-resource tabs inside a cluster.
- Concurrent cluster sessions; switching clusters preserves namespace scope,
  selected kind, search/sort/filters, sidebar state, open resource tabs and live
  terminal PTYs.
- Multiple namespace selection per cluster (all, one, or several).
- Sidebar favorites (pinned resource kinds), collapsible groups starting folded
  by default, and a configurable table row height (24–52px).
- Health, latency, Kubernetes version, context and API server in the UI.
- Per-cluster isolation: each cluster has its own Kubernetes client/auth context
  in the main process.

### Resource browser

- Dynamic API discovery, including CRDs and their printer columns.
- Pods, Deployments, StatefulSets, DaemonSets, ReplicaSets, Jobs, CronJobs,
  Services, Ingresses, NetworkPolicies, ConfigMaps, Secrets, Nodes, Namespaces,
  Events, PV/PVC, StorageClasses, ServiceAccounts, Roles/Bindings,
  ClusterRoles/Bindings, HPAs, PDBs, CRDs and every served custom resource.
- Live watch + polling, freshness indicator, counts, search, sorting, per-column
  filters, namespace filters, sortable columns, drag-to-resize columns (double-click
  to reset), horizontal scrolling, column picker and keyboard navigation.
- Multi-select mode with bulk delete and confirmation.
- Row context menu: details, YAML, logs, exec, scale, restart, copy kubectl
  command, delete.
- Create any discovered kind from YAML with server-side dry-run.

### Resource details

Overview / Details / YAML / Events / Logs (Pods) / Metrics inside a resizable
Freelens-style drawer. Header actions for logs, attach/exec, YAML, port forward,
delete, refresh and close. Pods show environment variables and ports; ConfigMaps
and Secrets are editable from the UI (Secret values decoded/encoded). Kind-specific Pod, workload, Service, Ingress, Node,
data, storage, HPA, CRD and generic CRD renderers. Pod Overview includes a Ports
table with one-click forwarding. Real events, real streaming logs, real
related-resource resolution. Secrets reveal only on request.

### Terminal

- Real local shells through node-pty, in a bottom dock with tabs. The shell
  receives a context-pinned, 0600 KUBECONFIG for the open cluster (and its
  selected namespace), so `kubectl` starts on the right context.
- Real Kubernetes pod exec over the exec WebSocket (no kubectl), with TTY resize.
- Port forwarding over the Kubernetes WebSocket protocol: loopback listener,
  live forwards panel, start/stop, and one-click port forwarding from the Pod
  Ports table, no kubectl process.
- xterm.js search, copy/paste, Radar console theme.

### Themes and layout

- Radar (light/dark/system), **Dracula**, and **Freelens** colour themes; each
  theme also selects its terminal ANSI palette.
- Reorderable favourite-cluster hotbar (open clusters stay in the top tab strip).
- Reorderable sidebar groups, column order, column widths (remembered per kind
  across clusters), and configurable row height from 24 to 52px.
- Problems filter for warning/error statuses, plus the regular status badges and
  per-column status filters.

### Design system

Radar-derived tokens and components: cool blue-gray surfaces, one brand blue,
DM Sans/DM Mono, 6/8/10/14px radii, status hues (success/warning/alert/error/info),
`light-dark()` theming, 0.5px hairlines, compact badges, menus, tooltips, dialogs,
collapsible sections, YAML viewer and console.

---

## Getting started

### Requirements (development)

- Node.js 22+
- pnpm 10+ (npm also works, but the lockfile is pnpm)
- Xcode command line tools on macOS (for the node-pty prebuilt check)

```bash
pnpm install
pnpm dev
```

`pnpm install` runs `scripts/postinstall.cjs`, which ensures node-pty's bundled
`spawn-helper` is executable (some installers skip node-pty's own postinstall).
Without that bit, local terminals fail with `posix_spawnp failed`.

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
- Full third-party notices: [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

mLens is an independent project and is not affiliated with Freelens, Skyhook, or
the Cloud Native Computing Foundation.
