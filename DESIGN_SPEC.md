# mLens — Design Specification

**Status:** implemented prototype (v0.1.0). This document describes the rules the
interface follows today, not an aspirational future design.

mLens is a desktop Kubernetes IDE with two explicit visual parents:

- **Freelens defines the application shell** — window chrome, cluster rail,
  catalog, sidebar, page tabs, bottom dock, details panel, button placement and
  the mechanics of opening things.
- **Skyhook Radar defines the Kubernetes tooling** — design tokens, typography,
  icons, table density, filters, status language, resource details, logs and the
  terminal surface.

The two must not be mixed randomly. A control's **position and behaviour** comes
from Freelens; its **size, colour, font and internal composition** comes from
Radar.

---

## 1. Research summary and source mapping

Both reference repositories were studied at source level before implementation.

| Component | Source | Notes |
|---|---|---|
| Application shell / window layout | **Freelens** | `packages/core/src/renderer/components/cluster-manager`, `layout/main-layout.tsx` |
| Top bar | **Freelens** | 40px drag region; home/back/forward on the left, window controls on Win/Linux |
| Hotbar (cluster rail) | **Freelens** | 75px in Freelens; curated cells, not a raw context dump |
| Cluster catalog | **Freelens** | `Catalog` page with its own menu sidebar and list layout |
| Welcome screen | **Freelens** | Centered welcome column + actions; mLens merges it into the catalog hero |
| Sidebar layout | **Freelens** | Cluster header + ordered/collapsible resource groups, 150–400px |
| Window management | **Freelens** | One desktop window; cluster views stay alive when switching |
| Tabs and navigation | **Freelens** | `SiblingsInTabLayout` (resource-kind tabs) + dock tabs |
| Details panel | **Freelens** | Right-side, resizable, inside the cluster frame |
| Resource Browser | **Radar** | `packages/k8s-ui/src/components/resources/ResourcesView.tsx`, `ResourcesSidebar.tsx` |
| Resource tables | **Radar** | `TableVirtuoso`, fixed layout, colgroup, 44px rows, 12px uppercase headers |
| Resource filters | **Radar** | `ActiveFilterBar`, per-column filter popovers, `/` search, regex mode |
| Resource Details content | **Radar** | Overview / Details / YAML / Events / Logs / Related / Metrics tabs |
| Typography | **Radar** | DM Sans Variable + DM Mono |
| Icons | **Radar** | `lucide-react` + kind→icon map |
| Colors | **Radar** | cool blue-gray surfaces, brand `#4A7CC9`/`#6A9FE0` |
| Terminal appearance | **Radar** | `#0F172A` console, 13px, Radar ANSI palette |
| Terminal integration | **Freelens + Radar UX** | Freelens-style bottom dock; Radar-style toolbar and surface |

### License constraints

| Project | License | What mLens uses |
|---|---|---|
| Freelens | MIT | Shell structure and interaction concepts; no source files copied |
| Radar | Apache-2.0 | Design-token values and component recipes adapted; attribution in `THIRD_PARTY_NOTICES.md` and `licenses/Apache-2.0.txt` |
| DM Sans / DM Mono | SIL OFL 1.1 | Bundled through `@fontsource` packages; fonts are not sold separately |
| lucide icons | ISC | Icon components |

mLens does not use the Radar or Skyhook names/logos as product marks, and does
not ship a Go backend.

---

## 2. Shell specification (Freelens)

### 2.1 Window anatomy

```
┌──────────────────────────────────────────────────────────────────────┐
│ Top bar · 44px · drag region · home/back · cluster pill · search · ⚙ │
├──────────────────────────────────────────────────────────────────────┤
│ Cluster tabs · 36px · open clusters, close = disconnect              │
├──────┬───────────────────────────────────────────────────────────────┤
│      │ Cluster frame                                                 │
│ Hot  │ ┌────────────┬──────────────────────────────────────────────┐ │
│      │ │            │ Open-resource tabs · 32px                    │ │
│ bar  │ │ Sidebar    │ Sibling resource tabs (36px)                 │ │
│ 54px │ │ 236px      │ ┌──────────────────────────────────────────┐ │ │
│      │ │ resizable  │ │ Resource browser (Radar table)           │ │ │
│      │ │ 170–420    │ │                    ┌─────────────────────┼─┤ │
│      │ │            │ │                    │ Details drawer      │ │ │
│      │ │            │ └────────────────────┴─────────────────────┘ │ │
│      │ │            │ Terminal dock (34px collapsed / 340px open)  │ │
│      │ └────────────┴──────────────────────────────────────────────┘ │
├──────┴───────────────────────────────────────────────────────────────┤
│ Status bar · 24px                                                    │
└──────────────────────────────────────────────────────────────────────┘
```

Dimensions are CSS pixels. Freelens uses 40/75/21px chrome; mLens keeps the same
structure at Radar's slightly larger control scale (44/54/24px).

**What is deliberately identical to Freelens**

- A **single application window**, never one browser window per resource.
- The **hotbar is the cluster switcher** on the far left; the catalog is the
  home view.
- The **cluster name lives in the sidebar header**, not in the page title.
- Resource **kinds are chosen in the sidebar**; a page-level tab strip shows the
  **sibling kinds** of the active group (e.g. Pods / Deployments / StatefulSets),
  mirroring Freelens' `SiblingsInTabLayout`.
- Clicking a resource **opens a right-side details panel** (Freelens drawer
  mechanic) rather than navigating away from the list.
- **Logs and terminals live in the bottom dock**; terminal tabs stay mounted when
  switching tabs.
- Top-bar home/back, window controls and the drag region follow Freelens
  placement.
- Details panel has no backdrop and does not unmount the list.

**Where mLens intentionally differs**

Freelens implements cluster isolation with one `<iframe>` per cluster (separate
origin, DI container, MobX graph). mLens runs one React tree and keeps **one
isolated Kubernetes session per cluster in the main process** (`KubeConfig`
instance + watchers + PTYs) plus a **keyed renderer session** holding namespace,
selected kind, filters, open details and terminal tabs. The user-visible
contract is the same: switching clusters preserves navigation and open tabs;
disconnecting a cluster tears down only that cluster's watchers and streams. The
trade-off is documented in `ARCHITECTURE.md` §10.

### 2.2 Top bar

Left → right:

1. Home (catalog).
2. Back — when the details drawer is open, returns to the previously opened
   resource; otherwise returns to the catalog.
3. Forward — present but disabled; mLens has no route history yet, and disabled
   is preferable to a fake action.
4. Active cluster pill: health dot, cluster name, Kubernetes version.
5. Command trigger (“Search clusters, resources and actions…”, `⌘K`).
6. New terminal, theme toggle, settings.
7. Window controls on Windows/Linux (minimise, maximise/restore, close). macOS
   keeps native traffic lights (`hiddenInset`).

The bar is the window drag region; every control is `no-drag`.

### 2.3 Hotbar

- 54px rail, deepest surface token (`--bg-sidebar`).
- Catalog button at the top, then **favourites → recently opened → active**
  clusters (maximum 9). A cluster appears after it is opened; mLens does not dump
  all 100+ kubeconfig contexts into the rail.
- Each cell: gradient tile with cluster initials, connection dot, tooltip with
  context/server/state. Duplicate-looking names remain distinguishable by colour
  and tooltip.
- Bottom: import kubeconfig, settings.

### 2.3a Cluster tabs and open-resource tabs

- A 36px cluster tab strip sits directly under the top bar. Each visited cluster
  keeps a tab with a health dot; the close button disconnects that cluster and
  removes its workspace. `+` returns to the catalog. The strip is hidden when no
  session exists.
- Inside a cluster, a 32px open-resource strip appears above the sibling-kind
  tabs. Every resource opened from a table, relation or command palette adds a
  tab (`name` + kind). Tabs switch the details drawer, keep a 25-entry back
  stack, and close with X (closing the active tab selects its neighbour).
- Inactive cluster workspaces stay mounted (CSS-hidden), exactly like Freelens'
  hidden cluster frames, so scroll, drawer state and live PTYs survive switching.

### 2.3b Cluster catalog selection

Catalog rows have an always-visible checkbox. A selection bar can add the
selected contexts to favourites or remove them from the catalog. Removal is
non-destructive: kubeconfig files are never modified. Removed clusters appear in
a **Removed** catalog view and can be restored; the hotbar, cluster tabs, command
palette and settings only see visible clusters.

### 2.4 Cluster sidebar

- Cluster header: avatar + health dot, cluster name, Kubernetes version and
  context, overflow menu (favourite, copy context, refresh namespaces, settings,
  catalog, disconnect).
- Resource filter input.
- Groups follow Freelens order: **Favorites, Nodes, Workloads, Config, Network,
  Storage, Namespaces, Events, User Management, Custom Resources**. Nodes,
  Namespaces and Events are direct rows without submenus. Config absorbs the
  remaining cluster-scoped kinds (webhooks, API services, admission policies,
  HPAs, PDBs, etc.).
- Custom Resources is a parent group with a **Definitions** child and one child
  per CRD API group; both levels collapse independently.
- Groups start collapsed by default (settings toggle), and the expanded state is
  remembered per cluster. Child rows are indented three spaces deeper than their
  group header.
- Hovering a kind shows a pin; pinned kinds appear in a Favorites section at the
  top and are stored globally.
- Group rows are collapsible and show the number of kinds; kind rows show icon,
  display name and a server count.
- Counts are lower-bound-aware and never invented: unavailable counts are blank;
  the sidebar reports when counts cannot be read.
- Bottom strip: namespace count + API server host.
- Width is draggable 170–420px and persisted.

### 2.5 Sibling resource tabs

A 36px strip above the table lists the other listable kinds in the active
sidebar group. It is the Freelens “resource tabs” mechanic: selecting a tab
changes the active kind without leaving the page. It is hidden when the group
contains a single kind.

### 2.6 Dock

- Collapsed height 34px, default open height 340px, minimum 140px, drag handle on
  the top edge.
- Tab strip: terminal icon + title + close; “new terminal”, maximise, collapse.
- All terminal tabs stay mounted; only the active one is visible, so scrollback
  and PTY state survive switching.
- Local shells and pod exec share the same dock, visually identical to Radar's
  console.
- Double-clicking the dock header collapses/expands it.

### 2.7 Details drawer

- Right edge, inside the cluster frame, **not** a modal and **not** a new window.
- Default width 560px; draggable 460px → 74% of the window; expand button morphs
  to nearly full width.
- Header: kind outline pill, status badge, API version, back-to-previous-resource,
  refresh, logs, attach/exec (Pods), YAML edit, port forward (Pods), delete,
  expand, close. Below: name, copy, namespace, age. Delete always asks for
  confirmation. This follows Freelens' action-in-drawer-header pattern.
- Tabs: **Overview, Details, YAML, Events, Logs, Related, Metrics**.
- `Escape`, `⌘W`/`Ctrl+W` close the drawer when it is open.
- Opening another row replaces the content and pushes the previous resource onto
  a 25-entry back stack.

### 2.8 Keyboard

| Shortcut | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Command palette |
| `⌘,` / `Ctrl+,` | Settings |
| `⌘T` / `Ctrl+T` | New local terminal |
| `⌘W` / `Ctrl+W` | Close details drawer (when open) |
| `Escape` | Close details |
| `/` | Focus table search (when not typing) |
| `↑` / `↓` / `Enter` | Move row highlight / open resource |
| `⌘C` / `Ctrl+C` | Copy terminal selection (otherwise sends ^C) |
| `⌘V` / `Ctrl+V` | Paste into terminal |
| `⌘F` / `Ctrl+F` | Terminal search |

---

## 3. Design system (Radar)

### 3.1 Type

| Role | Family | Usage |
|---|---|---|
| UI | **DM Sans Variable** (`@fontsource-variable/dm-sans`) | everything except code |
| Code / terminal | **DM Mono** (`@fontsource/dm-mono`) | YAML, logs, terminal, identifiers, ages |

Base 14px, line-height 1.5. Table body cells 14px; table headers 12px, 500,
uppercase, letter-spacing wide. Detail section titles 13px/500; drawer title
18px/600; dock tabs 12px; terminal 13px/1.2; logs 11px/20px.

### 3.2 Colour tokens

Dark is the default in mLens because the product is used next to terminals and
dashboards; light mode is fully supported.

| Token | Light | Dark |
|---|---|---|
| `--bg-sidebar` | `#E7ECF5` | `#080B16` |
| `--bg-base` | `#F0F3F9` | `#0B0F1E` |
| `--bg-surface` | `#F8FBFE` | `#14192A` |
| `--bg-elevated` | `#E6ECF5` | `#1E2338` |
| `--bg-hover` | `#DDE5F2` | `#282E48` |
| `--bg-active` | `#D3DCEC` | `#1C2840` |
| `--text-primary` | `#1A1C20` | `#F5F6F8` |
| `--text-secondary` | `#555860` | `#D8DAE0` |
| `--text-tertiary` | `#6B7080` | `#B0B5C0` |
| `--text-disabled` | `#A0A4AC` | `#6A7080` |
| `--border-default` | `#D8E0EE` | `#222840` |
| `--border-light` | `#CDD6E8` | `#2C324A` |
| brand / accent | `#4A7CC9` | `#6A9FE0` |
| success | `#22C55E` | `#22C55E` |
| warning | `#F59E0B` | `#F59E0B` |
| alert | `#F97316` | `#F97316` |
| error | `#EF4444` | `#EF4444` |
| info | `#3B82F6` | `#3B82F6` |
| terminal surface | `#0F172A` | `#0F172A` |

Rules:

- Never use raw Tailwind greys/blue for surfaces or text; use `bg-theme-*`,
  `text-theme-*`, `border-theme-*`.
- One brand hue only. Status hues are semantic and never used decoratively.
- Terminal/log surfaces stay dark in both themes.
- Selection uses `--selection-bg` / `selection-strong`; selected rows must also
  carry a ring (`selection-ring`) in keyboard navigation.

### 3.3 Geometry

| Token | Value | Use |
|---|---|---|
| `rounded` | 6px | badges, chips, inline elements |
| `rounded-md` | 8px | inputs, small containers |
| `rounded-lg` | 10px | buttons, dropdowns, panels |
| `rounded-xl` | 14px | dialogs, hero cards |
| table row | **44px** | natural Radar density (`px-4 py-3`, 14px text) |
| table header | 40px | `px-4`, 12px uppercase |
| badge | 24px | 12px, 0.5px border, 20px line-height |
| terminal dock tab strip | 34px | compact |
| top bar / status bar | 44 / 24px | shell chrome |

Shadows: `shadow-theme-sm/md/lg`, drawer shadow for the details panel. No
gradients except the catalog hero background and cluster avatar tiles.

### 3.4 Component contracts

- **Buttons**: `.btn-brand` primary, `.btn-secondary`, `.btn-ghost`, icon buttons
  28px. No floating action buttons.
- **Badges**: `.badge` / `.badge-sm` + a status class. Never hand-roll status
  colours in JSX. Kind identity uses `.kind-outline` (coloured text + outline,
  no fill).
- **Tables**: fixed layout, explicit column widths, hairline 0.5px row dividers,
  sticky header, hover row tint, `selection-strong` for the open resource.
- **Sections**: `.card-inner` / `.card-inner-lg`; collapsible sections use the
  grid-rows disclosure primitive, not native `<details>`.
- **Menus/dialogs**: `.menu-surface`, `.dialog`; portal, focus return on close,
  Escape closes.
- **Tooltips**: portal, 260ms delay, 11px, max 320px.
- **Empty/error states**: honest text, retry action where possible.

### 3.5 Resource browser composition

```
toolbar 48px : [kind icon] Kind  count  freshness | namespace · search · filters · columns · refresh · Create
filter bar 32px (only when filters active)
table      : fixed header + virtualised rows
footer 28px : loaded count · apiVersion/kind · CRD/built-in · visible/load more
```

- Search is case-insensitive across name, namespace, labels and visible cell
  values; regex mode is available and flagged red when invalid.
- Per-column filters open from the funnel in the header or the toolbar. A column
  is filterable when it has 2–60 distinct values. Filters are include-only
  multi-select with value counts.
- Column widths are draggable from the header divider (minimum 72px, double-click
  resets). The table keeps a horizontal scroll range when the sum exceeds the
  viewport.
- A checkbox column is always present: header selects all visible rows, the
  selection bar shows the count and offers bulk delete with an explicit
  confirmation listing the selected objects.
- The cluster catalog uses the same selection language: checkboxes, select all,
  bulk favourite, remove-from-catalog and a Removed view with restore.
- CPU and Memory columns use Radar's bullet-bar pattern: usage / limit, request
  marker, percentage, and a per-container tooltip. Without metrics the cell shows
  “–”; there are no synthetic values. Row height is configurable (36/40/44px).
- Resource kind favorites are pinned in a Favorites section; the pin appears on
  row hover and is stored in settings.
- Groups start collapsed when the setting is enabled (on by default); the
  expanded state is remembered per cluster.
- Sorting cycles ascending → descending → none; default is name ascending.
- Namespaces: all, one, or **several** at once. Multi-selection merges lists and
  watches per namespace, sums sidebar counts, and shows the Namespace column.
  System namespaces are hidden by default and toggleable in the picker or settings.
- Column visibility is per kind, persisted in the session; default-hidden
  columns (Pod IP, QoS, images…) are declared per kind.
- Rows open details on click and a context menu on right click (details, YAML,
  logs, exec, scale, restart, copy kubectl command, delete).
- Auto-update: live watch stream plus polling at the configured interval
  (10/30/60/120s or manual). The freshness indicator is explicit: `Live`,
  `Polling`, `Paused`, `Loading`, plus “Ns ago”.

### 3.6 Resource details content

- **Overview** — kind-specific summary. Pods: phase, node, IPs, QoS, service
  account, containers (image, readiness, restarts, requests/limits, ports),
  a **Ports** table where clicking the port number starts an automatic local
  forward and the Forward button opens the custom-port dialog, conditions, volumes, scheduling
  (node selector, tolerations and affinity rendered as aligned rows, not raw
  overflowing JSON). Workloads: replicas, rollout state,
  conditions, container template. Node: capacity/allocatable bars, conditions,
  system info, taints. Plus Services, Ingresses, ConfigMap/Secret (with explicit
  reveal), storage, CRDs, HPA, Jobs, events, generic CRDs.
- **Details** — metadata, owner references, labels, annotations, raw spec/status.
- **YAML** — Monaco, read-only by default, edit + dry-run + apply.
- **Events** — live event list, warning filter, search, counts, timestamps.
- **Logs** — streaming pod logs; workload/service/node pod picker; container,
  tail, follow, previous, timestamps, search, download, clear, line numbers;
  error/warn lines tinted.
- **Related** — owners, services selecting a Pod, pods managed by a workload,
  replicasets of a deployment, jobs of a cronjob, mounted config refs, node pods,
  bound PV. Every row navigates in the same drawer.
- **Metrics** — real metrics.k8s.io usage for Pods/Nodes; when the API is absent
  the panel says exactly that. No synthetic numbers; historical charts are not
  implemented.

### 3.6a Port forwarding

- A Pod action opens a start dialog (local port 0 = free port, pod port), creates a
  loopback listener and tunnels through the Kubernetes WebSocket
  port-forward protocol. The ports table exposes one-click Forward buttons.
- A **Port forwards** panel in the top bar lists every active forward across
  clusters with local/remote ports, start time, open-in-browser and stop.
- Stops automatically when the cluster is disconnected or the app quits.

### 3.7 Terminal and logs

- xterm.js surface `#0F172A`, foreground `#E2E8F0`, cursor `#60A5FA`, Radar ANSI
  palette, 13px DM Mono, line-height 1.2, 5000-line scrollback.
- Local shells are real PTYs via node-pty and receive a per-cluster KUBECONFIG
  (context + selected namespace) generated with 0600 permissions, so kubectl and
  Helm clients inside the shell target the open cluster. Pod shells are real
  Kubernetes exec over WebSocket with resize frames.
- Logs are DOM text (not xterm), DM Mono 11px, numbered, with a forced dark
  palette, matching Radar's “console is not chrome” rule.

---

## 4. State and navigation model (as seen by the user)

mLens keeps one mounted workspace per visited cluster and hides inactive ones
with CSS, mirroring Freelens' hidden cluster frames. This means table scroll and
positions, open drawers and live terminal processes survive switching — not just
serialized navigation state.

Per cluster, the following survive switching clusters:

- namespace scope (all / one / several), selected kind, sibling tab position;
- per-kind search text, regex flag, sort, column filters, hidden columns and
  column widths;
- sidebar group expansion (including nested CRD groups) and sidebar width;
- the open-resource tabs, the active resource, its details tab, and the back stack;
- dock open state, height, terminal tabs and their live PTYs.

Connections themselves also survive: switching clusters does not disconnect the
previous cluster, and its watchers continue to keep data fresh. Hidden workspaces
stop their polling loops but keep their watch streams, so returning to a cluster
shows current data without refetching everything.

Switching is done from the cluster tab strip, the hotbar, catalog, command
palette or settings. Open resources switch from the resource tab strip. The
catalog remains one click away (`Home`).

---

## 5. Explicit non-goals / present limitations

These are stated so they are not mistaken for finished features:

- **No extension system** (Freelens extensions are out of scope).
- **No route-level back/forward history** across resource kinds; the forward
  button is disabled, and back covers details history → catalog.
- **No Helm, topology, timeline, GitOps or audit views** yet.
- **No Prometheus history charts**; only live metrics-server values.
- **No multi-window** support; Freelens also assumes one main window.
- **No iframe-per-cluster** isolation; sessions are isolated in the main process
  and in keyed renderer state instead.
- **No synthetic data anywhere.** If an integration is unavailable, the UI says
  so and offers the relevant action.
