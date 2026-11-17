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
| Welcome + cluster catalog | **Done** | Hero, stats, category rail, search, favourites, recents, kubeconfig sources |
| Catalog multi-select / removal | **Done** | Checkboxes, bulk favourites, remove-from-catalog (non-destructive), Removed view + restore |
| Kubeconfig import (file dialog) | **Done** | Multi-select; validated; source list |
| Kubeconfig import (paste) | **Done** | Validated, written 0600 under userData |
| Context discovery | **Done** | 98 real contexts detected from `~/.kube/config` |
| Connect / disconnect | **Done** | Per-cluster `KubeConfig`, health, latency |
| Kubernetes version + namespaces | **Done** | Real API calls |
| Multiple simultaneous clusters | **Done** | One mounted workspace per visited cluster (hidden when inactive); switching preserves scroll, drawer, filters and live PTYs |
| Cluster tabs / open-resource tabs | **Done** | Top cluster tabs (close = disconnect) and per-cluster resource tabs with back stack |
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
| Context menu actions | **Done** | Details, YAML, logs, exec, scale, restart, copy kubectl, delete |
| Create from YAML | **Done** | Monaco editor, server dry-run, apply |
| Large-list paging | **Done** | Continue token + “Load more” for single/all scopes; multi-namespace caps each scope at 1000 for now |
| Dracula / Freelens themes | **Done** | Token-level themes, Monaco themes, terminal palettes |
| Status problems filter | **Done** | Warning/error toggle with live count across kinds |
| Column order + global widths | **Done** | Per-kind order; widths keyed kind+column across clusters |
| Hotbar favourites + drag reorder | **Done** | Open clusters in top tabs; hotbar is reorderable favourites |
| Sidebar group reorder | **Done** | Drag top-level catalog groups; persisted in settings |
| Request-volume reduction | **Done** | Counts only expanded/favourite groups (≥120s), metrics only when visible (≥60s), 60s default polling |
| CPU/Memory table columns | **Done** | Radar-style bullet bars, request markers, per-container tooltips; Node usage/allocatable bars; “–” without metrics |
| Configurable row height | **Done** | Settings: 24–52px |
| Sidebar kind favorites | **Done** | Pinned kinds section + settings list, stored globally |
| Groups collapsed by default | **Done** | Settings toggle, on by default; expanded state kept per cluster |

### Resource details

| Feature | Status | Notes |
|---|---|---|
| Lens drawer mechanics | **Done** | Right panel, resizable, expand, back stack, action toolbar (logs/exec/YAML/port-forward/delete/close), Escape |
| Radar content and tabs | **Done** | Overview / Details / YAML / Events / Logs / Related / Metrics |
| Pod overview | **Done** | Freelens-style sections with aligned property rows: status, containers, Ports + Forward, conditions, volumes, scheduling/tolerations/affinity |
| Deployment/STS/DS/RS overview | **Done** | Replicas, conditions, containers, owner |
| Node overview | **Done** | Capacity/allocatable, conditions, system info, addresses, taints |
| Service / Ingress | **Done** | Ports, selectors, rules, TLS, address |
| ConfigMap / Secret | **Done** | Keys, values, explicit reveal for secrets |
| PV/PVC, StorageClass | **Done** | Capacity, claim/volume, class, access modes |
| CRD description | **Done** | Group, scope, versions, printer columns |
| Generic CRD renderer | **Done** | Status/spec/metadata, never blank |
| Events tab | **Done** | Live, filtered by involved object, warning filter, search |
| Logs tab | **Done** | Streaming, container/pod picker, follow/previous/tail/timestamps, search, download |
| Related resources | **Done** | Owners, selectors, services, replicasets, config refs, node pods, bound PV |
| YAML tab | **Done** | Monaco, edit, dry-run, apply |
| Metrics tab | **Partial** | Real metrics-server values for Pod/Node; no history charts |
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
| Separate namespace/cluster picker in terminal UI | **Partial** | Terminal inherits the cluster and pod namespace from the action that opened it; no standalone picker yet |

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

- [ ] Topology graph (data already available through Related).
- [ ] Diagnostics / problem scoring.
- [ ] Timeline of changes.
- [ ] Helm release browsing (secrets-based, no Helm binary).
- [ ] GitOps views (Argo/Flux CRDs already appear as generic resources).
- [ ] Prometheus metrics and historical charts.
- [ ] Cluster audit / policy reports.
- [ ] Node shell.
- [ ] Multi-window.
- [ ] Extension API.
- [ ] Capability-aware (SelfSubjectAccessReview) action gating.
- [ ] Route-level back/forward across resource kinds.
- [ ] Table CPU/memory columns from metrics-server.
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
| Problems status filter | Pass — 115 warning/error rows isolated on a live cluster |
| Column order | Pass — up/down in the column picker, persisted per kind |
| Cluster switch with live terminal | Pass — xterm/PTY stays mounted through catalog → other cluster → back |
| Pod exec (WebSocket + resize) | Pass (`MLENS_EXEC_OK`) |
| Packaging (macOS arm64) | Pass — `mLens.app` + `MLens-0.1.0-arm64.dmg`; packaged app launches, sees 98 contexts, connects, runs a PTY with the right kubectl context, and port-forwards a real pod (HTTP 200) |
| Windows / Linux packaging | Configured (NSIS, AppImage, deb); not yet built on those OSes |

---

## Next iteration priorities

1. **Packaging run per OS** (`dist:mac`, `dist:win`, `dist:linux`) in CI, verify
   node-pty asar unpacking and notarization.
2. **Capability-aware write actions** using SelfSubjectAccessReview.
3. **Prometheus history** on top of the live metrics columns.
4. **Helm** (release secrets parsed in TypeScript, no Helm binary).
5. **Topology/Timeline**, reusing Related + watch data.
6. **Automated tests**: unit tests for status/format/columns, integration tests
   against `kind`, Playwright Electron smoke tests.
