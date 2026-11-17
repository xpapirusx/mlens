# mLens — Implementation Plan

This is the working plan and status ledger. It distinguishes what is **done and
verified against real clusters**, what is **partially done**, and what is **not
started**, so nothing in the product is mistaken for finished work.

Last updated: 2026-11-17 · version 0.1.0

---

## Stage 1 — Research (done)

- [x] Source-level study of Freelens: shell, window model, cluster frames,
      catalog/welcome, sidebar, tabs, dock, drawer, state persistence.
- [x] Source-level study of Radar: tokens, tables, filters, details, logs,
      terminal, icons, CRD discovery contract.
- [x] License review: Freelens MIT; Radar Apache-2.0; fonts OFL; libraries.
- [x] Source mapping table and constraints (`DESIGN_SPEC.md` §1).
- [x] `DESIGN_SPEC.md`, `ARCHITECTURE.md`, this plan.

Verification evidence: concrete file paths and excerpts from both repos were
used to derive the mapping (e.g. Freelens `MainLayout` grid, `DockStore`,
`SidebarItem`, Radar `ResourcesView` row/header classes, drawer tabs, xterm
configuration).

---

## Stage 2 — Design and architecture (done)

- [x] Process split, security model, IPC contract.
- [x] Radar token system, typography, radii, component classes.
- [x] Freelens-derived shell metrics and layout.
- [x] Multi-cluster session model (main connections + keyed renderer sessions).
- [x] Navigation model: sidebar kinds, sibling tabs, drawer, dock.
- [x] Build strategy: electron-vite + electron-builder, ESM main, CJS preload,
      node-pty prebuilds.
- [x] Project scaffold created from scratch.

---

## Stage 3 — Core shell and clusters

| Feature | Status | Notes |
|---|---|---|
| Electron app, single window | **Done** | Sandboxed renderer, typed preload, CSP |
| Custom top bar, drag region, window controls | **Done** | Native traffic lights on macOS; custom controls on Win/Linux |
| Hotbar cluster rail | **Done** | Favourites → recent → active; catalog button |
| Hotbar pages + selector | **Done** | Freelens-style pages of 10 slots (`hotbarPages`/`hotbarPageIndex`), ‹ N › selector with page list / New page / Remove page, favourites auto-flow into free slots, hover-only scrollbar with a reserved gutter |
| Welcome + cluster catalog | **Done** | Hero, stats, category rail, search, favourites, recents, kubeconfig sources |
| Catalog multi-select / removal | **Done** | Checkboxes, bulk favourites, remove-from-catalog (non-destructive), Removed view + restore |
| Kubeconfig import (file dialog) | **Done** | Multi-select; validated; source list |
| Kubeconfig import (paste) | **Done** | Validated, written 0600 under userData |
| Context discovery | **Done** | 98 real contexts detected from `~/.kube/config` |
| Connect / disconnect | **Done** | Per-cluster `KubeConfig`, health, latency |
| Kubernetes version + namespaces | **Done** | Real API calls |
| Multiple simultaneous clusters | **Done** | One mounted workspace per visited cluster (hidden when inactive); switching preserves scroll, drawer, filters and live PTYs |
| Cluster tabs / open-resource tabs | **Done** | Top cluster tabs with Home/Back/Forward in the tab strip (close = disconnect), and per-cluster resource tabs with back stack |
| Multiple namespace scopes | **Done** | All / one / several; merged lists, per-namespace watches, summed counts |
| Application shell (Freelens layout) | **Done** | Sidebar, sibling tabs, dock, drawer, status bar |
| Sidebar resource catalog | **Done** | Dynamic discovery incl. CRDs; counts; collapse; filter |
| Radar design system | **Done** | Tokens, typography, badges, tables, menus, terminal theme |
| Settings | **Done** | Theme, refresh interval, terminal font, system namespaces, sources, clusters, about |
| Command palette | **Done** | Clusters, kinds, actions, appearance |
| Theme (light/dark/system) | **Done** | `.dark` + `light-dark()` tokens |

---

## Stage 4 — Kubernetes UX

### Resource browser

| Feature | Status | Notes |
|---|---|---|
| Radar-style table | **Done** | Fixed layout, 44px rows, 40px uppercase header, virtualised |
| Column definitions for core kinds | **Done** | Pods, workloads, jobs, services, ingress, netpol, config/secret, nodes, namespaces, events, PV/PVC/SC, RBAC, HPA, PDB, CRD + generic |
| Dynamic CRD columns | **Done** | `additionalPrinterColumns` from CRDs |
| Search | **Done** | All visible values + labels; `/` shortcut; regex mode |
| Per-column filters | **Done** | Distinct-value popovers, include multi-select, counts |
| Namespace scope | **Done** | All / one / several namespaces; merged rows, per-namespace watches, summed counts; system namespace toggle |
| Sorting | **Done** | asc → desc → none, per kind |
| Column visibility | **Done** | Per kind; default-hidden columns |
| Always-visible selection | **Done** | Checkbox column, select-all-visible, bulk delete confirmation |
| Column resizing + horizontal scroll | **Done** | Drag header divider; double-click resets; table scrolls when wider than viewport |
| Status indicators | **Done** | Kind-aware status mapping, Radar status badges |
| Resource counts | **Done** | Sidebar counts via `remainingItemCount` |
| Auto-refresh | **Done** | Live watch + polling interval; freshness indicator |
| Context menu actions | **Done** | Details, edit YAML, Pod logs/attach/exec, scale (Deployment/STS/RS), restart (Deployment/STS/DS), pause/resume rollout (Deployment), suspend/resume (Job/CronJob), Node cordon/uncordon, copy kubectl, delete, force delete |
| Row actions menu | **Done** | Sticky right-hand "…" column opens the same actions; checked against Pods, Deployments, Nodes |
| Force delete | **Done** | DeleteOptions with gracePeriodSeconds 0 after explicit confirmation |
| CRD naming in catalog | **Done** | CRs/CRDs show the kind name; apiVersion in the tooltip; built-ins win name collisions |
| Init containers | **Done** | Table: separator before main containers, `init ·` in the square tooltip; Pod Overview: numbered Init containers section |
| Container squares (Radar) | **Done** | Containers column: centred 10px tiles coloured by state, orange restart ring, init separator, rich tooltip (state, reason, message, exit code, uptime, last termination) |
| Node table (Radar) | **Done** | CPU/Memory usage÷allocatable bars, Conditions and Taints columns; Node kind now fetches metrics.k8s.io |
| Details workload actions | **Done** | Right-aligned labelled actions under the name (Scale/Restart/Pause/Suspend/Cordon/Drain/Set image/Trigger) plus Radar-style Scale/Pause buttons in Overview; Delete/Reload/Close in the header |
| Set image | **Done** | Container + init-container image editor patches the pod template for Deployment/STS/DS/RS/Job/CronJob |
| CronJob trigger | **Done** | Creates a one-off Job from `jobTemplate` via apply |
| Drain Node | **Done** | Live plan (DaemonSet/mirror kept, emptyDir/unmanaged flagged), optional cordon, policy/v1 Eviction with delete fallback |
| Global search | **Done** | `⌘K` palette searches live resources for 2+ character queries (debounced, capped) |
| Letter navigation | **Done** | `g` then p/d/s/j/c/n/x/o |
| Shortcut overlay | **Done** | `?` opens the full shortcut sheet |
| Pin columns | **Done** | Column picker pin, sticky left freeze |
| Collapse resource tabs | **Done** | Chevron collapses the strip into a bottom shadow tray with all tabs still clickable |
| Minimize details | **Done** | Drawer hides without closing; open tabs stay; floating pill restores it |
| YAML find/replace | **Done** | Own find bar on `model.findMatches`: count, match case, next/prev, replace, replace all |
| Clickable references | **Done** | Owner refs, volumeName/claimRef/storageClassName/scaleTargetRef and PVC Pods/Volume/Storage-class cells open their targets |
| PVC → pod column | **Done** | "Pods" column lists pods mounting the claim, clickable (one Pod list per scope) |
| Freelens hotbar | **Done** | 75px rail, 40px cells, 12px spacing, three-letter names, seeded colour, LED, press/shake animations |
| Secret/ConfigMap line numbers | **Done** | Line-number gutter + `type`/`kind` header with key counts and size |
| Window drag anywhere | **Done** | Whole shell is a drag region; controls, rows, scroll areas, terminals and editors stay native |
| Connected clusters first | **Done** | Open sessions (connected/connecting/error) sort first; Status says Connected; sort by status/name/recent/source |
| CR/CRD details | **Done** | Custom kinds open on Details (Freelens order); CRD Overview has Radar cards, versions, printer columns and conditions |
| Collapsible resource tabs | **Done** | Collapse to a bottom shadow tray; every tab stays clickable and restorable |
| Scale safety | **Done** | HPA ownership is checked on pressing Scale (lazy, one namespaced HPA list) and blocks manual scaling |
| Namespace cell click | **Done** | Clicking a namespace scopes the table to it |
| Node cell click | **Done** | Pod Node cells open the Node details drawer |
| Background click | **Done** | Clicking empty table space closes the details drawer |
| Node actions | **Done** | Cordon/Uncordon in the row menu, drawer header and Node Overview |
| Cluster Overview home | **Done** | Nodes ready, counts, warning events, capacity, API/CRD surface, quick links; default landing page |
| Related resources | **Done** | Related tab restored for every kind using the live resolver, Freelens-style list |
| Bulk bar placement | **Done** | Selection + delete bar sits above the terminal dock |
| Create from YAML | **Done** | Monaco editor, server dry-run, apply |
| Large-list paging | **Done** | Continue token + “Load more” for single/all scopes; multi-namespace caps each scope at 1000 for now |
| Dracula / Freelens themes | **Done** | Token-level themes, Monaco themes, terminal palettes |
| Status problems filter | **Done** | Warning/error toggle with live count across kinds |
| Column order + global widths | **Done** | Per-kind order; widths keyed kind+column across clusters |
| Hotbar favourites + drag reorder | **Done** | 10 fixed slots, pointer/HTML5 drag, context-menu move fallback; open clusters in top tabs |
| Sidebar group reorder | **Done** | Drag top-level catalog groups; persisted in settings |
| Request-volume reduction | **Done** | Counts only expanded/favourite groups (≥120s), metrics only when visible (≥60s), 60s default polling |
| CPU/Memory table columns | **Done** | Radar bars for Pods (container usage vs limit/request) and Nodes (usage ÷ allocatable); Metrics tab Pod-only |
| Configurable row height | **Done** | Settings: 24–52px |
| Sidebar kind favorites | **Done** | Pinned kinds section + settings list, stored globally |
| Groups collapsed by default | **Done** | Settings toggle, on by default; expanded state kept per cluster |

### Resource details

| Feature | Status | Notes |
|---|---|---|
| Lens drawer mechanics | **Done** | Right panel, resizable, expand, back stack, action toolbar (logs/exec/YAML/port-forward/delete/close), Escape |
| Radar content and tabs | **Done** | Overview / Details / YAML / Events / Related / Logs (Pods only) / Metrics |
| Pod overview | **Done** | Freelens-style sections: status, containers, environment with inline Secret/ConfigMap peek, Ports + Forward, conditions, volumes, scheduling/tolerations/affinity |
| Deployment/STS/DS/RS overview | **Done** | Replicas, conditions, containers, owner; Scale and Pause/Resume buttons for supported kinds |
| Node overview | **Done** | Capacity/allocatable, conditions, system info, addresses, taints |
| Node overview (Radar) | **Done** | Issues/Cordoned banners, Node info, Capacity with In use, Resource usage bars, Addresses, Platform labels, Taints, Conditions |
| Pods on node | **Done** | Live `spec.nodeName` list with status badges, first 30 + “Show all”, click opens the Pod, count in the header |
| Permissions via ServiceAccount | **Done** | Pod + workload Overview: `N direct bindings · N inherited via groups · N distinct rules`, top-5 rules as chips, blast radius banner, link to the ServiceAccount; `kube:rbac-subject` IPC with a 10s per-cluster snapshot |
| Service / Ingress | **Done** | Ports, selectors, rules, TLS, address |
| ConfigMap / Secret | **Done** | Key/value view, explicit reveal, and UI editing with Secret base64 decode/encode via merge patch |
| Env references | **Done** | Eye reveals referenced ConfigMap/Secret values inline without leaving the Pod |
| Loading screen | **Done** | Animated cluster ring, indeterminate sweep and staged discovery text |
| Hotbar interactions | **Done** | 10 slots, pointer/native drag, context-menu move, Freelens-style neutral tiles |
| PV/PVC, StorageClass | **Done** | Capacity, claim/volume, class, access modes |
| CRD description | **Done** | Group, scope, versions, printer columns |
| Generic CRD renderer | **Done** | Status/spec/metadata, never blank |
| Events tab | **Done** | Live, filtered by involved object, warning filter, search |
| Logs tab | **Done** | Pods only; streaming, container picker, follow/previous/tail/timestamps, search, download |
| Specification & Status | **Done** | Sorted flat fields; complex objects/arrays are collapsed JSON blocks (drawer height stable) |
| Related resources | **Done** | Restored by request; owners, selectors, services, config, node and volume relationships |
| YAML tab | **Done** | Monaco, edit, dry-run, apply |
| Metrics tab | **Partial** | Real metrics-server values for Pods only; no history charts |
| Conditions | **Done** | Timeline presentation with polarity |
| Port forwarding | **Done** | Loopback TCP forward over Kubernetes WebSocket; one-click from the Ports table; verified HTTP 200 from a real pod; active forwards panel |

### Terminal

| Feature | Status | Notes |
|---|---|---|
| xterm.js embedded terminal | **Done** | Radar palette, search, copy/paste, resize |
| Local shell via node-pty | **Done** | Verified `echo`; shell gets KUBECONFIG for the open cluster + namespace |
| Kubernetes pod exec | **Done** | Verified interactive `echo MLENS_EXEC_OK` in a real pod |
| Multiple terminal tabs | **Done** | Mounted simultaneously; state preserved |
| Terminal search | **Done** | Finder UI, next/previous |
| Select container | **Done** | Detail header exec uses first container; logs allow selection |
| Standalone cluster/namespace picker | **Done** | New-terminal launcher (plus chevron / `⌘⇧T` / empty dock): any connected cluster, context-default or explicit namespace |
| Pod exec from the launcher | **Done** | Live pod list for the chosen namespace, container picker, configurable shell command |

### Kubernetes integration

| Feature | Status |
|---|---|
| Kubeconfig loading, multiple files | **Done** |
| Context switching per session | **Done** |
| Auth: token, client certs, basic, exec plugins | **Done** (via client library) |
| API discovery incl. aggregated APIs | **Done** |
| Resource list/get/watch | **Done** |
| Logs | **Done** |
| Exec | **Done** |
| YAML apply / delete / scale / restart | **Done** |
| Namespace management (list) | **Done** |
| RBAC-aware UI (hide denied actions) | **Partial** — server errors are shown clearly; actions are not pre-filtered by SelfSubjectAccessReview |
| Metrics | **Partial** — metrics-server reads; no Prometheus history |

---

## Stage 5 — Advanced features (not started)

- [ ] Topology graph (owner references/selectors are available from the data layer).
- [ ] Diagnostics / problem scoring.
- [ ] Timeline of changes.
- [ ] Helm release browsing (secrets-based, no Helm binary).
- [ ] GitOps views (Argo/Flux CRDs already appear as generic resources).
- [ ] Prometheus metrics and historical charts.
- [ ] Cluster audit / policy reports.
- [ ] Node shell.
- [ ] Multi-window.
- [ ] Extension API.
- [ ] Global URL state / deep links and a full-page detail route.
- [ ] Compare two resources (YAML diff).
- [ ] CRD schema search and YAML schema/autocomplete from CRD OpenAPI.
- [ ] Revision history + rollback (ReplicaSet revisions).
- [ ] Pod file browser (list/preview/upload) and debug/ephemeral containers.
- [ ] Node debug pod / node terminal.
- [ ] TLS certificate parsing from Secrets (subject, SAN, expiry).
- [ ] HPA charts + 14-state diagnosis; Prometheus charts; rightsizing;
      PVC usage bar; restart chart.
- [ ] Reflector/ownership graph links.
- [ ] Structured JSON logs with level filters; workload log aggregation;
      JobSet/Ray/CNPG logs; logs in the bottom dock.
- [ ] My Permissions (SelfSubjectRulesReview), effective SA permissions and
      reverse lookup, blast-radius warnings, capability-aware UI.
- [ ] Resource templates.
- [ ] Capability-aware (SelfSubjectAccessReview) action gating.
- [ ] Route-level back/forward across resource kinds.
- [ ] Unit/integration test suite (currently verified by typecheck, build and
      manual real-cluster smoke tests).

---

## Verification log

| Check | Result |
|---|---|
| `tsc --noEmit` main+preload+shared | Pass |
| `tsc --noEmit` renderer | Pass |
| `electron-vite build` | Pass (renderer bundle ~6.8 MB incl. Monaco) |
| App launch & catalog | Pass, 98 real contexts discovered |
| Connect to real cluster | Pass (`lz1-avg-preprod-compute`, v1.31; `msk-avg-dev-iaas-mgmt`, v1.29) |
| Discovery and counts | Pass (228 CRDs, Pods 215/282, Secrets 2340+, etc.) |
| Filter popovers + active filter chips | Pass (Status filter → 204/215 rows) |
| Command palette open/close, Escape | Pass |
| Light/dark theme switching | Pass (tokens resolve, body `#F0F3F9` in light) |
| Settings dialog | Pass (theme, refresh, terminal, sources, clusters) |
| Resource table + virtualization | Pass |
| Details drawer Overview/Details | Pass with real Pod data |
| YAML tab | Pass (real object, Monaco highlight) |
| Logs tab | Pass (real streaming logs) |
| Local PTY | Pass (`MLENS_PTY_OK`) |
| Terminal cluster context | Pass — `kubectl config current-context` = open cluster; namespace = selected namespace |
| Port forward | Pass — localhost tunnel returned HTTP 200 from a real pod |
| Multi-namespace | Pass — 2 namespaces merged; Namespace column shown; no per-request errors |
| Column resize | Pass — Name column changed 240→360px; horizontal overflow scrolls |
| Multi-select | Pass — checkboxes, 2 rows selected, bulk bar + delete confirmation |
| Catalog selection/removal | Pass — cluster removed from catalog, Removed view, restored; kubeconfig untouched |
| CPU / Memory bars | Pass — live metrics-server samples with limit bars, % and request markers |
| Quick port forward | Pass — clicking port 8080 started a loopback forward |
| Sidebar favorites / collapsed groups | Pass — pinned kinds appear at top; groups start folded |
| Dracula / Freelens themes | Pass — theme tokens, shell, tables, details and terminal palettes |
| ConfigMap/Secret editor | Pass — create/patch/get/delete verified against a real ConfigMap |
| Random port forwarding | Pass — packaged app forwarded on local port 30120 and returned HTTP 200 |
| Problems status filter | Pass — 115 warning/error rows isolated on a live cluster |
| Workload actions in drawer | Pass — icon actions right-aligned; Deployment Scale/Restart/Pause, StatefulSet Scale/Restart, ReplicaSet Scale, Job Suspend, Node Cordon; dialogs open |
| Cluster Overview | Pass — live counts (Pods 282+, Deployments 96, Nodes 1/1), capacity 48 CPU / 504 GiB, warning events, no console errors |
| Related tab | Pass — Pod owners + 4 referenced ConfigMaps/Secrets resolved from the live API |
| Init containers | Pass — a 5-init Cilium pod renders `1/1 +5 init` and the Init containers section |
| Row menu / force delete | Pass — sticky right-hand kebab opens Attach/Exec/Logs/Set image/Delete/Force delete; force dialog shows grace-period 0 |
| Drain plan | Pass — 276 pods on the node, 109 evictable, 18 DaemonSet, 167 blocked by emptyDir without local-data consent |
| Set image | Pass — dialog lists containers and init containers with the template path |
| CronJob actions | Pass — Suspend / Set image / Trigger present |
| Global search / shortcuts | Pass — palette returns live resource hits; `?` overlay renders |
| Catalog sorting/status | Pass — connected cluster first, Status `Connected`, Version in its own column, Sort: Status/Name/Recent/Source |
| CR/CRD details | Pass — CiliumEndpoint opens on Details; Overview shows cards + 7 printer columns + status |
| Bottom tab tray | Pass — 4 open tabs collapse into a bottom shadow tray, tabs clickable, chevron restores the strip |
| YAML find/replace | Pass — "apiVersion" → 1/4 with highlighted matches, next/prev navigation |
| PVC drill-down | Pass — pod link opens the Pod, Volume opens the PV, Storage class opens the StorageClass; Details volumeName link opens the PV |
| Owner drill-down | Pass — Controlled-by cell opens the owning StatefulSet |
| Minimize/restore details | Pass — drawer hides, pill `PersistentVolume/pvc-…` restores it |
| Secret layout | Pass — name/keys/namespace header, `type: kubernetes.io/tls · keys: 3 · size: 3.8 KiB`, numbered values |
| Hotbar | Pass — 40×40px / 6px tiles, three-letter initials (`msk-avg-preprod-nlb` → `MAP`), seeded colour, LED top-left |
| Window drag | Pass — `#root` computed `-webkit-app-region: drag` |
| Related: cluster-scoped owner | Pass — owner refs no longer inherit the child's namespace; navigation resolves apiVersion and cluster-scoped targets (reported on PinataHost) |
| Secret/ConfigMap layout | Pass — resource name + key count above the table, key stacked over value, reveal/copy per key |
| Attach | Pass — pods/attach WebSocket started against a live pod without errors |
| Workload actions in table | Pass — context menu shows Scale/Restart/Pause rollout for Deployments, Scale for ReplicaSets, Suspend for Jobs |
| Column order | Pass — up/down in the column picker, persisted per kind |
| Cluster switch with live terminal | Pass — xterm/PTY stays mounted through catalog → other cluster → back |
| Pod exec (WebSocket + resize) | Pass (`MLENS_EXEC_OK`) |
| Packaging (macOS arm64) | Pass — `mLens.app` + `MLens-0.1.0-arm64.dmg`; packaged app launches, sees 98 contexts, connects, runs a PTY with the right kubectl context, and port-forwards a real pod (HTTP 200) |
| Windows / Linux packaging | Configured (NSIS, AppImage, deb); not yet built on those OSes |
| Radar container squares / Node table + details / RBAC permissions / hotbar pages | Pass — `pnpm typecheck` and `pnpm build`; real-cluster smoke test still pending |

---

## Next iteration priorities

1. **Packaging run per OS** (`dist:mac`, `dist:win`, `dist:linux`) in CI, verify
   node-pty asar unpacking and notarization.
2. **Capability-aware write actions** using SelfSubjectAccessReview.
3. **Prometheus history** on top of the live metrics columns.
4. **Helm** (release secrets parsed in TypeScript, no Helm binary).
5. **Topology/Timeline**, reusing owner/selector and watch data.
6. **Remaining Radar workload actions**: revision history + rollback
   (ReplicaSet revisions), Set image, and CronJob Trigger (create a Job from
   `jobTemplate`).
7. **Automated tests**: unit tests for status/format/columns, integration tests
   against `kind`, Playwright Electron smoke tests.
