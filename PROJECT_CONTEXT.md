# PROJECT_CONTEXT.md — how mLens was built and everything around it

This document is the full working context for mLens: what it is, how the two
reference products shaped it, which decisions were made (and why), what is
verified, and where the sharp edges are. `AGENTS.md` contains the rules for
changing the code; this file contains the story and the current state.

---

## 1. Product in one paragraph

mLens is a standalone desktop Kubernetes IDE. It borrows the **application shell
mechanics from Freelens** (one window, cluster rail/tabs, cluster catalog,
resource sidebar, sibling tabs, bottom dock, right details drawer, preserved
per-cluster state) and the **Kubernetes UI language from Skyhook Radar** (DM Sans /
DM Mono, cool blue-gray surfaces, 44px data-dense tables, filters, status badges,
compact details, dark console). It is implemented entirely in TypeScript/React on
Electron. There is no Go backend, no bundled kubectl/Helm, no Docker, and no
separate server. Everything privileged runs in the Electron main process behind a
typed preload IPC bridge.

---

## 2. Research phase

The first pass was source-level, not screenshot-level.

### Freelens (MIT)

Key files studied:

- `packages/core/src/renderer/components/cluster-manager/*` — root shell, hotbar,
  root frame, cluster frame handlers.
- `packages/core/src/renderer/components/layout/*` — `MainLayout` grid,
  sidebar/sidebar item, top bar, tab layouts, sibling tabs.
- `packages/core/src/renderer/components/dock/*` — dock tabs/store/terminal.
- `packages/core/src/renderer/components/kube-object-details/*` and `drawer/*` —
  right-side details panel.
- `packages/core/src/renderer/components/catalog/*`, `welcome/*`, `add-cluster/*`.
- `packages/core/src/renderer/components/hotbar/*` — 75px rail, drag/drop,
  favourite/curated clusters.
- `packages/core/src/features/theme/files/common/freelens.theme.yaml` — palette,
  terminal colours.
- `packages/core/src/common/sidebar-menu-items-starting-order.ts` and each
  `sidebar-item.injectable.tsx` — exact sidebar order and membership.
- `packages/core/src/renderer/components/workloads-pods/columns/*` and
  `column-priority.ts` — Pod column priority/order.

Important findings that shaped mLens:

- Freelens uses **one BrowserWindow with an iframe per cluster**, each iframe a
  separate origin/JS realm, hidden with CSS instead of unmounted.
- The broad layout is: top bar 40px, hotbar 75px, cluster sidebar 200px
  (150–400 resizable), bottom dock (default 300px), right drawer (725px).
- Resource list pages have **sibling resource tabs**, not browser tabs; resource
  details open in a right drawer; dock tabs are for terminal/logs/edit.
- Sidebar top-level order: Favorites, Cluster, **Nodes**, Workloads, Config,
  Network, Storage, **Namespaces**, **Events**, Helm, User Management, Custom
  Resources. Nodes/Namespaces/Events are top-level leaves. Custom Resources
  contains Definitions and CRD API groups.
- Pod columns are priority-ordered, with IP/Node/QoS hidden by default.
- The theme is a rich set of semantic tokens, including a separate terminal
  palette.

### Skyhook Radar (Apache-2.0)

Key files studied:

- `packages/k8s-ui/src/theme/variables.css`, `tailwind-theme.css`,
  `components.css` — tokens, light/dark via `light-dark()`, status classes.
- `packages/k8s-ui/src/components/resources/ResourcesView.tsx` — table header/row
  markup, filters, column picker, CPU/Memory bullet bars, status cells.
- `packages/k8s-ui/src/components/resources/ResourcesSidebar.tsx` — kind catalog.
- `packages/k8s-ui/src/components/workload/ResourceDetailDrawer.tsx`,
  `ResourceRendererDispatch.tsx`, `drawer-components.tsx` — detail tabs/sections.
- `packages/k8s-ui/src/components/dock/*`, `logs/*` — xterm and log styling.
- `packages/k8s-ui/src/utils/resource-icons.ts`, `badge-colors.ts`.
- `pkg/k8score/discovery.go` — discovery contract (reimplemented in TypeScript).

Important findings:

- Cool blue-tinted neutral palette; brand blue `#4A7CC9`/`#6A9FE0`; DM Sans +
  DM Mono; 6/8/10/14px radii; 44px table rows; 12px uppercase headers.
- Tables are virtualised with `react-virtuoso`, fixed layout, explicit colgroup.
- Detail drawer is inside the shell, 550px default, reserves the dock height.
- Logs/terminal are intentionally dark in both themes.
- Resource icons are a lucide-based kind map, never a sprite.
- CRD support is discovery-driven, with `additionalPrinterColumns`.

### Licensing

- Freelens MIT: shell concepts were reimplemented; no source files copied.
- Radar Apache-2.0: design token values/recipes adapted; attribution in
  `THIRD_PARTY_NOTICES.md`, Apache text in `licenses/`.
- Fonts OFL; libraries permissive. No Radar/Skyhook branding used.

---

## 3. Architecture decisions

### 3.1 Process split

Electron main owns:

- kubeconfig files and per-cluster `KubeConfig` instances;
- auth (tokens, certs, exec credential plugins), TLS agents;
- API discovery, lists, watches, counts;
- logs, exec WebSockets, port-forward WebSockets;
- node-pty local shells;
- settings JSON and terminal kubeconfig exports.

Renderer is sandboxed; the preload exposes only the typed `window.mlens` API.
No `ipcRenderer`, no filesystem, no credentials in renderer.

### 3.2 Cluster isolation without iframes

Freelens gets isolation from iframes. mLens instead:

- keeps one isolated `KubeConfig`/connection/manager per cluster in main;
- mounts **one mounted React workspace per visited cluster** and hides inactive
  ones with CSS. Switching clusters therefore preserves table scroll, filters,
  drawers, open-resource tabs and live PTYs, just like Freelens' hidden frames.
- stops polling in hidden workspaces but keeps watches connected.

### 3.3 Lens mechanics, Radar visuals

- Cluster tabs row (open clusters) and resource tabs row (open resources) follow
  the Lens mental model while using Radar sizing/typography.
- Resource list lives in the main pane; clicking a row opens the right drawer.
- Details keeps Freelens' drawer placement but uses Radar's action set: a
  right-aligned labelled action row under the name (Pods: Logs/Exec/Forward;
  workloads: Scale/Restart/Set image/Pause/Resume; Jobs/CronJobs:
  Suspend/Resume/Trigger/Set image; Nodes: Cordon/Uncordon/Drain), Delete next
  to Close in the header, YAML and Related as tabs.
  Env references are peekable inline; ConfigMaps/Secrets have a key/value editor.
- Logs are available for Pods only. Pods show environment variables; ConfigMaps
  and Secrets have a key/value editor (Secrets decoded/encoded transparently).
- Bottom dock holds terminal sessions, all mounted, only active visible.

### 3.4 Kubernetes data layer

- Discovery: `/api/v1`, `/apis`, each preferred group version, CRD definitions.
- Generic REST through `node:https` + `RequestContext` authentication so exec
  plugins work.
- Lists are discovery-driven, namespace-scoped, paged; multiple namespaces are
  fetched per scope and merged by UID.
- Watches reconnect from the last resourceVersion and are backed by polling.
- Counts use `limit=1` + `remainingItemCount`, only for expanded groups and
  favourites, at ≥120s, to avoid request storms.
- Metrics are optional (`metrics.k8s.io`), fetched only when CPU/Memory columns
  are visible, at ≥60s; absent data renders `–`.
- Mutations: delete with confirmation; scale merge-patch; restart annotation
  patch; YAML apply with dry-run and replace/create.
- Capabilities: `checkAccess` posts SelfSubjectAccessReview through the same
  authenticated request path; the renderer caches answers for 60s and hides a
  write control only on an explicit denial (`null` = unknown, keep visible).
- Port forwarding implements the Kubernetes WebSocket protocol directly (server
  sends the little-endian port handshake; client strips it; no kubectl process).
- Terminal shells get a generated 0600 kubeconfig with the cluster context and
  selected namespace, deleted on quit.

---

## 4. What was built, in order

1. **Scaffold:** electron-vite (ESM main, CJS preload), React 19, Tailwind v4,
   TypeScript, electron-builder config, CSP, single-window lifecycle.
2. **Shared contract:** domain types and IPC channel/API definitions.
3. **Main Kubernetes layer:** kubeconfig manager, authenticated HTTP helper,
   discovery, sessions, list/get/watch/counts, mutations, logs, exec, port
   forwarding, PTYs, settings.
4. **Renderer foundations:** Radar tokens (light/dark), typography, component
   primitives, YAML viewer (Monaco), terminal (xterm).
5. **Freelens shell:** top bar, hotbar, cluster tabs, catalog, sidebar, sibling
   tabs, resource tabs, dock, status bar, command palette, settings.
6. **Radar resource browser:** virtualised table, columns, search, regex, sort,
   per-column filters, namespace scope, column picker, selection, bulk delete,
   context actions, create/apply.
7. **Radar details:** drawer tabs, all renderers, events, logs, related, metrics,
   YAML edit/apply, ports, port-forward.
8. **Session/state:** per-cluster namespaces, kind state, open resource tabs,
   back stack, terminals, layout preservation across cluster switching.
9. **Themes:** Radar light/dark, Dracula, Freelens, terminal palettes.
10. **Polish batches:** sidebar order/membership, CRD nesting, favourites,
    collapsed groups, column resize/order, global widths, multi-namespace,
    catalog removal/restore, hotbar favourites + drag, request-volume reduction,
    drawer footer actions, affinity/related fixes.

---

## 5. Current feature inventory (verified)

**Clusters/catalog**

- Reads `~/.kube/config` + `KUBECONFIG`; imports files or pasted YAML; multiple
  sources; favourites; recent; removed/restore; catalog multi-select.
- Per-cluster connection, version, namespaces, health.
- Cluster tabs (with home/back/forward controls) at the top; close = disconnect.
  Opening a cluster activates its tab before the API answers, so the workspace
  plays the connecting animation for the whole connect + discovery and failures
  land on its error screen with Retry.
- Catalog: open clusters rise to the top, Status reads Connected (version is a
  separate column), with status/name/recent/source sorting.
- Hotbar is a reorderable favourites rail on a 75px Freelens-style rail
  (40px tiles, 12px spacing, three-letter short names, seeded colours, status
  LED, press/shake animation; drag or context-menu move) split into **pages of
  ten slots**: `‹ N ›` arrows and a badge switch/choose pages, new pages can be
  added and removed, overflow favourites flow into the next page, and the tile
  area scrolls on short windows; open clusters live in top tabs with the
  Home/Back/Forward controls.

**Resource browser**

- Dynamic discovery incl. CRDs; Freelens-ordered sidebar with:
  Favorites, Nodes, Workloads, Config, Control, Network, Storage, Namespaces,
  Events, User Management, Custom Resources (Definitions + CRD API groups).
  Config holds workload configuration; Control holds the cluster machinery
  (Lease, APIService, ControllerRevision, CSR, FlowSchema, quotas, limit
  ranges, webhooks, admission policies), and a category added by an update
  keeps its default position in a saved drag order.
- Groups collapsed by default (setting), remembered per cluster; drag to reorder
  top-level groups; pinned kind favourites.
- Radar table: 44px default rows (24–52 setting), 40px uppercase header,
  status badges, CPU/Memory bullet bars with request markers and per-container
  tooltips, Ports column, optional owner/node/qos/IP columns.
- Containers cells are Radar's state squares with a restart ring and a full
  diagnostic tooltip; the Nodes table carries usage÷allocatable CPU/Memory bars
  plus Conditions and Taints columns (node metrics are fetched for the Node
  kind).
- Service/Config/Access Control columns follow Radar: live Endpoints from the
  core `Endpoints` object, Type and External columns, ConfigMap Size, coloured
  Secret Type plus TLS Expires (pure DER parser in `lib/certificate.ts`),
  ServiceAccount Automount, role badges with an `sa:`/`grp:` subjects preview,
  CRD Kind + Status; Service status is its own type, CRD status is
  Established/Terminating.
- Search (`/`, regex), sort, per-column filters, multi-namespace scope, counts
  for visible groups, auto-refresh/watch, column resize + horizontal scroll,
  column visibility and order, always-visible selection + bulk delete,
  row context menu, create from YAML.
- Column widths/order persist globally per kind/column, across clusters.

**Details**

- Right drawer, resizable/expandable, tabbed: Overview, Details, YAML, Events,
  Logs (Pods only), Metrics.
- Kind actions are right-aligned icon buttons in the drawer header:
  Logs/Exec/Forward (Pods), Scale/Restart (Deployments, StatefulSets), Scale
  (ReplicaSets), Restart (DaemonSets), Pause/Resume rollout (Deployments),
  Suspend/Resume (Jobs/CronJobs), Cordon/Uncordon, Drain and Debug shell
  (Nodes), Delete next to Close; Expand sits before Minimize.
  Reload (clockwise) refetches data; Restart uses the counter-clockwise icon.
  Workload Scale also sits in the Overview Status section, matching Radar.
- Manual scaling is refused when an HPA owns the replica count; the check runs
  only when Scale is pressed (one namespaced HPA list), so idle drawers cost
  nothing.
- Pod overview includes status, containers, Ports (click port = instant forward;
  Forward button = custom port dialog), conditions, volumes, scheduling with
  structured tolerations/affinity.
- Workload/Service/Ingress/ConfigMap/Secret/Node/PV/PVC/HPA/CRD/generic renderers.
- Node Overview mirrors Radar: Issues and Cordoned banners, Node info,
  Capacity with an In use row, live Resource usage, Addresses, Platform labels,
  Taints, Conditions, and a live **Pods on this node** list that opens each Pod.
- Pod and workload Overviews end with **Permissions via ServiceAccount**
  (`kube:rbac-subject` IPC over the four RBAC kinds): direct vs group-inherited
  bindings, distinct rules, top-five permissive rules and a blast-radius
  banner; a forbidden read is shown as a calm note.
- Pod and workload Overviews also carry a **Policy** section
  (`kube:policy-resource`): the cluster's PolicyReport/ClusterPolicyReport
  findings for that subject, with explicit not-installed / not-checked /
  denied states.
- Service Overview: load-balancer-pending and no-selector banners, full
  Service properties, NodePort in the ports table and a live **Endpoints**
  section (ready / not-ready addresses).
- Access Control overviews: ServiceAccount (permissive-grant banner, direct /
  inherited / effective permissions, used-by pods, workload identity),
  Role/ClusterRole (wildcard banner, bindings reverse lookup via
  `kube:rbac-role`, rule cards, aggregation rule) and RoleBinding
  (no-subjects / wide-grant banners, role reference, live rules with
  orphan-binding and 403 states, subject cards).
- Secrets show a **Certificate** section (subject, issuer, coloured expiry)
  parsed from `tls.crt`; ConfigMap/Secret show an Immutable banner.
- YAML search is Monaco's stock find widget (contribution registered in
  `lib/monaco.ts`): Ctrl/Cmd+F with regex, match case, whole word, counter and
  replace.
- The **Node debug shell** (drawer action row + row menu) shows an editable
  privileged-pod manifest, applies it, waits for Running and attaches an exec
  console; closing that tab deletes the pod.
- Related tab restored for every kind; the resolver lists owners, selectors,
  services, mounted config, node pods and bound volumes using Freelens-style
  rows, with a sticky substring/regex filter and kind chips.
- Pod Volumes link straight to their ConfigMap/Secret (direct and projected).
- Metrics tab shows real metrics-server values or an explicit “not installed”.

**Terminal/logs/ports**

- Local PTY with per-cluster kubeconfig; pod exec over WebSocket with resize;
  multiple tabs; search; copy/paste. A context launcher (`⌘⇧T`, the dock chevron
  or the empty dock state) chooses any connected cluster, namespace, and for pod
  exec the pod, container and shell command; each tab header shows its cluster
  context.
- Streaming logs with container/pod picker, follow/previous/tail/timestamps,
  filtering, download.
- Port forwarding over WebSocket, active forwards panel, quick forward with a
  random local port in 30000–65355.
- Reference navigation: owner references, spec/status reference fields and the
  Controlled-by/PVC columns open their targets; the details drawer minimizes to
  a floating pill so the table can be used with tabs still open.
- Workload actions (scale/restart/pause/resume/suspend) plus Node cordon, in
  the leading row menu and the drawer header, with an HPA guard on manual
  scaling; clickable namespace and node cells, force delete, attach, init
  containers, bulk selection bar above the terminal, terminal full-line hover
  highlight.
- Per-cluster Overview home page with live counts, warnings, capacity and quick
  links; it is the default landing view after connecting.

**Themes/settings**

- Radar light/dark/system, Dracula, Freelens and Proton (luci-theme-proton2025
  palette) — app tokens, Monaco and terminal palettes for each.
- Settings: color theme, mode, refresh interval (default 60s), system namespaces,
  table row height, collapse groups, sidebar favourite kinds, terminal font,
  kubeconfig sources, clusters, about.
- Layout reset, dock height, terminal palettes.

---

## 6. Verification log

| Check | Result |
|---|---|
| TypeScript (main/preload/shared) | pass |
| TypeScript (renderer) | pass |
| electron-vite production build | pass |
| macOS arm64 app + DMG | built; packaged app launches |
| Real clusters | discovered and connected (v1.29 / v1.31 contexts) |
| Discovery/CRDs | 228 CRDs, printer columns, categories |
| Lists/watches/counts | verified with hundreds of pods/events |
| Details/YAML/Events | verified with real objects |
| Logs | real streaming logs |
| Local PTY | `echo` round-trip; cluster context verified with kubectl |
| Pod exec | interactive `echo` verified |
| Port forward | localhost tunnel returned HTTP 200 from a real pod |
| Multi-namespace | two scopes merged; Namespace column shown |
| Column resize/order | resized to 360px; persisted via settings |
| Catalog remove/restore | verified; kubeconfig untouched |
| Themes | Dracula applied across shell/tables/details; terminal palette wired |
| Terminal persistence | xterm/PTY stays mounted across catalog → cluster → cluster |
| SelfSubjectAccessReview | Batch request shape verified against a live context (`get pods` → allowed by `cluster-admin`); typecheck + build pass. Read-only UI smoke test pending |

---

## 7. Build and packaging

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm dist:mac | dist:win | dist:linux
```

- electron-vite: ESM main, CJS preload, static renderer.
- Electron 45.3.3; electron-builder 26; node-pty N-API prebuilds unpacked from
  asar; macOS hardened runtime entitlements included.
- `scripts/postinstall.cjs` fixes node-pty `spawn-helper` execution bits.
- `pnpm-workspace.yaml` allows electron/node-pty build scripts; Electron 45.3.3
  is excluded from minimum-release-age policy.
- DMG is unsigned by default (`CSC_IDENTITY_AUTO_DISCOVERY=false` for local
  builds); macOS Gatekeeper requires right-click → Open.

---

## 8. Known sharp edges / next work

- No topology, timeline, GitOps-specific views, audit or extension API.
- Metrics history (Prometheus) not implemented; live metrics only.
- Port forwarding: TCP loopback only, one port per forward, no UDP.
- Multi-namespace lists cap each scope at 1000 rows and disable paging.
- Capability-aware actions use batched SelfSubjectAccessReview (`auth:can`):
  denied write controls are hidden in the details drawer and in
  single-namespace browser views; failed reviews keep actions visible.
- No automated test suite yet; verification is by typecheck/build/manual real
  cluster smoke tests.
- Route-level back/forward across resource kinds is not implemented; back covers
  resource history and catalog.
- Catalog group order/hotbar order use HTML5 drag; no drag library.
- Status filters appear only when a column has 2+ distinct values (Radar-style).
- Radar workflow actions not yet ported: revision history + rollback and
  Argo/Flux/GitOps action bars. Set image, CronJob Trigger and Node Drain are
  implemented. ReplicaSet intentionally has no Restart (its template is owned by
  the Deployment and reconciled away).

---

## 9. How to reason about changes

- Read `AGENTS.md` first.
- Keep shell mechanics and visual language separate.
- Prefer discovery + generic objects over hard-coded kinds.
- Never fake data, never silently swallow a failed integration.
- Preserve per-cluster state; keep workspaces mounted; keep terminals alive.
- Reduce Kubernetes request volume: watches + explicit polling, counts only for
  expanded groups, metrics only when columns are visible.
- Update `DESIGN_SPEC.md`, `ARCHITECTURE.md`, `IMPLEMENTATION_PLAN.md` and this
  file when behaviour/structure changes.
