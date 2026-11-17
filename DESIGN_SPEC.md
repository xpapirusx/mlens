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
| Hotbar (cluster rail) | **Freelens** | 75px, 40px cells with 12px margins; curated cells, not a raw context dump |
| Cluster catalog | **Freelens** | `Catalog` page with its own menu sidebar and list layout |
| Welcome screen | **Freelens** | Centered welcome column + actions; mLens merges it into the catalog hero |
| Sidebar layout | **Freelens** | Cluster header + ordered/collapsible resource groups, 150–400px |
| Window management | **Freelens** | One desktop window; cluster views stay alive when switching |
| Tabs and navigation | **Freelens** | `SiblingsInTabLayout` (resource-kind tabs) + dock tabs |
| Details panel | **Freelens** | Right-side, resizable, inside the cluster frame |
| Resource Browser | **Radar** | `packages/k8s-ui/src/components/resources/ResourcesView.tsx`, `ResourcesSidebar.tsx` |
| Resource tables | **Radar** | `TableVirtuoso`, fixed layout, colgroup, 44px rows, 12px uppercase headers |
| Resource filters | **Radar** | `ActiveFilterBar`, per-column filter popovers, `/` search, regex mode |
| Resource Details content | **Radar** | Overview / Details / YAML / Events / Logs (Pods) / Metrics tabs |
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
| luci-theme-proton2025 | Apache-2.0 | Colour palette of the Proton theme adapted to mLens tokens; attribution in `THIRD_PARTY_NOTICES.md` |
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
│ 75px │ │ 236px      │ ┌──────────────────────────────────────────┐ │ │
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

The **whole shell** is a window drag region (any chrome or background area moves
the window); interactive controls, table rows, scroll areas, terminals and
editors are `no-drag`, so selection, scrolling and editing keep working.

### 2.3 Hotbar

- 75px rail, deepest surface token (`--bg-sidebar`); cells are 40×40px with
  12px margins, like Freelens.
- The rail has **10 slots per page** and shows favourite clusters only, like
  Freelens. Open clusters live in the top cluster-tab strip. Favourite tiles can
  be dragged to reorder them (persisted in `hotbarOrder`); empty slots open the
  catalog.
- **Pages** follow Freelens' multiple hotbars: favourites that do not fit flow
  into the following pages automatically, so no favourite is ever lost. A
  selector under the tiles shows `‹ N ›` — arrows switch page, and the number
  badge opens the page list with *New page* / *Remove this page* (up to twelve
  pages, each persisted in `settings.hotbarPages`). The visible page index lives
  in `settings.hotbarPageIndex`.
- The tile area scrolls vertically when the window is short: the scrollbar
  gutter is reserved on both edges and the thumb only appears on hover, so
  tiles never shift sideways (Freelens' `.HotbarItems` behaviour).
- Each cell: a solid seeded-colour tile (`hsl(FNV1a(name) , 60%, 27%)`) with the
  Freelens three-letter short name (`msk-avg-dev…` → `MAD`), a status LED at the
  top-left with a glow when connected, a press animation on click (empty slots
  shake), hover/active ring shadows, and a tooltip with context/server/state.
- Bottom: import kubeconfig, settings.

### 2.3a Cluster tabs and open-resource tabs

- A 36px cluster tab strip sits directly under the top bar, with Home/Back/Forward
  controls at its left (the old top-bar navigation was moved here). Each visited cluster
  keeps a tab with a health dot; the close button disconnects that cluster and
  removes its workspace. `+` returns to the catalog. The strip is hidden when no
  session exists.
- Inside a cluster, a 32px open-resource strip appears above the sibling-kind
  tabs. Every resource opened from a table, relation or command palette adds a
  tab (`name` + kind). Tabs switch the details drawer, keep a 25-entry back
  stack, and close with X (closing the active tab selects its neighbour).
- Inactive cluster workspaces stay mounted (CSS-hidden), exactly like Freelens'
  hidden cluster frames, so scroll, drawer state and live PTYs survive switching.
- The open-resource strip can be collapsed into a slim shadow tray directly above
  the terminal dock. The tray keeps every tab rendered and clickable and offers a
  chevron to restore the strip to the top.

### 2.3b Cluster catalog selection

Open clusters (a live session exists) sort to the top of the catalog; the Status
column reads **Connected** and the Kubernetes version lives in the Version column.
A sort control switches between open/status, name, recently opened and kubeconfig
source.

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
- Groups follow Freelens order: **Favorites, Nodes, Workloads, Config, Control,
  Network, Storage, Namespaces, Events, User Management, Helm, Custom Resources**.
  Nodes, Namespaces and Events are direct rows without submenus. Config keeps
  workload configuration (ConfigMap, Secret, HPA/VPA, PDB, PriorityClass,
  PriorityLevelConfiguration, RuntimeClass, PodTemplate); **Control** holds the
  cluster machinery Config used to absorb (Lease, APIService, ControllerRevision,
  CertificateSigningRequest, FlowSchema, ResourceQuota, LimitRange, mutating /
  validating webhooks and admission policies). A category an update adds appears
  at its default position, not after everything the user already reordered
  (`mergeGroupOrder`).
- **Favorites has its own chevron**: pinned kinds start expanded (they were
  pinned on purpose), collapse like any group into `expandedGroups["__favorites"]`,
  and a hairline separates them from the ordered menu below.
- Custom Resources is a parent group with a **Definitions** child and one child
  per CRD API group; both levels collapse independently.
- Groups start collapsed by default (settings toggle), and the expanded state is
  remembered per cluster. Child rows are indented three spaces deeper than their
  group header.
- Hovering a kind shows a pin; pinned kinds appear in a Favorites section at the
  top and are stored globally.
- Group rows are collapsible and show the number of kinds; kind rows show icon,
  display name and a server count.
- **Level-1 alignment**: every top-level header — Favorites, Nodes, Workloads,
  Config, Control, Network, Storage, Namespaces, Events, User Management, Helm,
  Custom Resources — lays out `16px icon + name` from `pl-2`, so all names start
  at the same x as a kind row (32px). The count, the disclosure chevron and the
  drag grip sit on the **right**, so revealing the grip on hover never nudges
  the label. Child groups (depth > 0) keep the indented `chevron + name` form.
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
- The plus button opens a local shell immediately in the current context, keeping
  Lens' one-click behaviour. The adjacent chevron and `⌘⇧T` open the **terminal
  context launcher**: local shell or pod exec, with an explicit cluster context,
  namespace (or the context default), and — for pod exec — pod, container and
  shell command. The launcher is also offered from the empty dock state.
- A `FileCode` button in the dock header (and in the empty dock state) opens the
  **Create from YAML** tab: a multi-document Monaco editor that accepts one
  manifest or several separated by `---`, counts the documents live, and applies
  through the same server-side-checked path as the Create dialog (Dry run /
  Apply). This is the primary create flow: the **Create** button in the
  resource-browser toolbar opens the same dock tab instead of a modal, and a
  successful apply makes every mounted table refetch
  (`mlens:resources-applied`).
- All terminal tabs stay mounted; only the active one is visible, so scrollback
  and PTY state survive switching.
- Local shells and pod exec share the same dock, visually identical to Radar's
  console. The per-tab header shows the cluster context and namespace so a
  cross-cluster session is never ambiguous.
- Double-clicking the dock header collapses/expands it.

### 2.7 Details drawer

- Right edge, inside the cluster frame, **not** a modal and **not** a new window.
- Default width 560px; draggable 460px → 74% of the window; expand button morphs
  to nearly full width.
- Header: kind outline pill, status badge, API version, Back, Delete, Reload,
  Expand, Minimize and Close. Minimize hides the drawer without closing it — the
  open-resource tabs stay and a floating pill at the bottom-right restores it. Delete sits next to Close and always asks for confirmation.
  A right-aligned kind-action row sits under the resource name: Logs / Exec /
  Forward (Pods), Scale / Restart / Set image (Deployments, StatefulSets,
  ReplicaSets where applicable), Restart / Set image (DaemonSets), Pause/Resume
  rollout (Deployments), Suspend/Resume / Trigger / Set image (Jobs, CronJobs),
  Cordon/Uncordon, Drain and Debug shell (Nodes). Reload (clockwise arrow) refetches data;
  Restart uses the counter-clockwise arrow.
- Tabs: **Overview, Details, YAML, Events, Related, Logs (Pods only), Metrics**. Related is shown for every kind and lists owners, selectors, services, mounted config, node pods and bound volumes when they exist; the list uses Freelens-style rows (kind, name, namespace, relation, status).
- `Escape`, `⌘W`/`Ctrl+W` close the drawer when it is open.
- Opening another row replaces the content and pushes the previous resource onto
  a 25-entry back stack.

### 2.8 Keyboard

| Shortcut | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Command palette |
| `⌘,` / `Ctrl+,` | Settings |
| `⌘T` / `Ctrl+T` | New local terminal in the current context |
| `⌘⇧T` / `Ctrl+Shift+T` | New terminal in a chosen cluster/namespace context |
| `⌘W` / `Ctrl+W` | Close details drawer (when open) |
| `Escape` | Close details |
| `/` | Focus table search (when not typing) |
| `↑` / `↓` / `Enter` | Move row highlight / open resource |
| `⌘C` / `Ctrl+C` | Copy terminal selection (otherwise sends ^C) |
| `⌘V` / `Ctrl+V` | Paste into terminal |
| `⌘F` / `Ctrl+F` | Terminal search |

---

## 3. Design system (Radar)

### 3.0 Colour themes

Radar is the default contract (light/dark/system). Three additional themes
override tokens globally and force dark mode:

- **Dracula** — `#282A36` base, `#21222C` surfaces, `#44475A` elevated,
  `#BD93F9` accent, `#F8F8F2` text; terminal palette from the Dracula ANSI scheme.
- **Freelens** — `#1E2124` base, `#262B2F` surface, `#36393E` sidebar, teal
  `#00A7A0` accent, Freelens terminal palette.
- **Proton** — adapted from *luci-theme-proton2025* (Apache-2.0,
  ChesterGoodiny): `#0F1419` slate base, `#161C26` cards, `#1A1F2E` elevated,
  `#23293D` active, blue accent `#5E9EFF` (hover `#7DB2FF`), text
  `#F5F7FA / #C5CAD5 / #9299A8`, status hues `#6BCF7F / #FFD93D / #FF6B6B`,
  hairlines `rgba(255,255,255,…)`; matching Monaco (`mlens-proton`) and
  terminal palettes. The source theme ships a light variant too; only its dark
  palette is ported, like Dracula and Freelens.

Theme classes live in `design-system/styles/themes.css`; no component-specific
theme hacks.

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
- Columns can be pinned from the column picker; pinned columns are frozen at the
  left edge while the rest scrolls horizontally.
- Open-resource tabs can be collapsed to a one-line count and expanded again.
- A checkbox column is always present: header selects all visible rows; the
  selection bar sits at the bottom of the resource browser, directly above the
  terminal dock, and carries **Labels** and **Annotate** (menus of saved
  `key=value` presets from settings, editable behind "Manage …", each applied
  through a confirm), **Copy names** (dialog with line-break / comma /
  semicolon separators and an optional `namespace/name` form) and bulk delete.
  A second, always-visible leading column opens the row action menu (open, edit
  YAML, labels/annotations, logs, attach, exec shell, scale, restart, pause,
  suspend, cordon, copy kubectl, delete, force delete) — the same menu as
  right-click.
- Force delete sends `gracePeriodSeconds: 0` after an explicit confirmation.
- Discovered custom kinds show the kind name as-is in the sidebar; the tooltip
  carries `<apiVersion> <Kind> (CRD)`. Built-in kinds win over same-named CRDs
  (e.g. `v1 Node` is the Nodes row, a CRD called Node lives in its API group).
- Pod Containers cells are Radar's container squares: one 10px tile per
  container centred in the cell, coloured by state (green ready, yellow running
  but not ready, red waiting/terminated, grey-with-border completed, dashed
  unknown), an orange ring while `restartCount > 0`, and a hairline separator
  between the init block and the main containers. The tooltip carries the full
  story — `init · name`, state, reason, message, exit code, uptime/duration and
  the last termination (reason + exit code) that explains a CrashLoopBackOff.
  The Pod Overview keeps its dedicated **Init containers** section with
  numbered, amber-edged cards.
- Node columns follow Radar: CPU and Memory are usage ÷ allocatable bullet bars
  from `metrics.k8s.io` (falling back to allocatable for sorting when metrics
  are absent), plus **Conditions** (green `Healthy`, otherwise the actual
  problems — Disk/Memory/PID pressure, NetworkUnavailable, NotReady) and
  **Taints** (`key=value:effect`, amber, with the count in the tooltip). Pods
  stays a plain capacity number because a per-node running count would need a
  cluster-wide pod list per table render.
- The Config/Access Control/Service kinds follow Radar's column sets:
  Services show **Type** (badge: violet for LoadBalancer/NodePort, sky for
  ClusterIP), **Selector**, **Endpoints** (Active / No endpoints / None /
  External — resolved from the core `Endpoints` object, one list per scope,
  `–` while not fetched), **Ports** and **External** load-balancer addresses;
  ConfigMaps add **Size**; Secrets show a coloured **Type** badge and
  **Expires** (days until the `tls.crt` certificate expires — red past due or
  under 30d, amber under 90d, `!` when the certificate cannot be parsed);
  ServiceAccounts lead with **Automount** (green No / amber Yes); Roles show
  **Rules** with Resources folded away; RoleBindings show a **Role** badge
  (`R`/`CR` + name) and a `sa:`/`grp:` **Subjects** preview with `+N`;
  CRDs add **Kind** and **Status** (Established / Terminating / Not
  established). Certificate parsing is a pure DER walk in `lib/certificate.ts`,
  verified against real certificates.
- A **Warnings** column appears for Pods, workloads and Nodes: an amber warning
  icon with the event count, a tooltip carrying the latest Warning event's
  reason and message, and the reason as its filter value. It is fed by one
  `type=Warning` event list per namespace scope (`useWarningEvents`), fetched
  only while a kind that has the column is on screen — Freelens' pods-warning
  column, generalised.
- The cluster catalog uses the same selection language: checkboxes, select all,
  bulk favourite, remove-from-catalog and a Removed view with restore.
- Status is surfaced three ways: the status badge column, per-column status
  filters, and a **Problems** toggle that keeps only warning/error resources
  across any kind.
- Namespace cells are clickable: clicking one scopes the table to that namespace.
- Reference cells are clickable too: Controlled by, PVC Pods/Volume/Storage
  class, and every reference field in Details (`volumeName`, `claimRef`,
  `storageClassName`, `imagePullSecrets`, HPA `scaleTargetRef`, owner refs…).
  Pod **Volumes** link straight to the referenced ConfigMap or Secret (direct
  volumes and projected sources alike).
- Workload actions (row context menu and drawer action row): Scale for
  Deployment/StatefulSet/ReplicaSet (merge patch `spec.replicas`, refused when an
  HPA owns the replica count), Restart for Deployment/StatefulSet/DaemonSet,
  Pause/Resume rollout for Deployment, Suspend/Resume for Job/CronJob. Radar does
  not offer Restart on ReplicaSets: their pod template is owned by the Deployment,
  which reconciles the patch away, so a "restart" there is not a real rollout.
- Pod CPU and Memory columns use Radar's bullet-bar pattern: usage / limit,
  request marker, percentage, and a per-container tooltip; Node CPU/Memory use
  usage ÷ allocatable. Without metrics the cell shows “–”; there are no
  synthetic values. Row height is configurable (24–52px).
- Resource kind favorites are pinned in a Favorites section; the pin appears on
  row hover and is stored in settings.
- Column order is editable up/down in the column picker and stored per kind, so
  it survives cluster switches. Column widths are stored globally per
  kind+column, so resizing Name in Pods applies to Pods in every cluster while
  Deployment keeps its own widths.
- Top-level sidebar groups can be dragged to reorder them; the order is global.
- Groups start collapsed when the setting is enabled (on by default); the
  expanded state is remembered per cluster.
- Sorting cycles ascending → descending → none; default is name ascending.
- Namespaces: all, one, or **several** at once. Multi-selection merges lists and
  watches per namespace, sums sidebar counts, and shows the Namespace column.
  System namespaces are hidden by default and toggleable in the picker or settings.
- Column visibility is per kind, persisted in the session; default-hidden
  columns (Pod IP, QoS, images…) are declared per kind.
- Rows open details on click and a context menu on right click (details, YAML,
  logs, exec, scale, restart, pause/resume rollout, suspend/resume, copy kubectl
  command, delete).
- Auto-update: live watch stream plus polling at the configured interval
  (10/30/60/120s or manual). The freshness indicator is explicit: `Live`,
  `Polling`, `Paused`, `Loading`, plus “Ns ago”.

### 3.6 Resource details content

- **Custom resources / CRDs** — the drawer opens on **Details** (Freelens field
  order: name, namespace, created, labels, annotations, owner). The Overview tab
  uses Radar-style cards: CRD definitions show Group, Kind, Scope and version
  count plus versions/printer columns/conditions; CR instances show kind, API
  version, namespace, age, printer-column values, conditions, status and spec.
- **Overview** — kind-specific summary. Pods: phase, node, IPs, QoS, service
  account, containers (image, readiness, restarts, requests/limits, ports),
  a **Ports** table where clicking the port number starts an automatic local
  forward (random local port 30000–65355) and the Forward button opens the custom-port dialog, conditions, volumes, scheduling
  (node selector, tolerations and affinity rendered as aligned rows, not raw
  overflowing JSON). Workloads: replicas, rollout state, conditions, container
  template, and a Scale + Pause/Resume action row (Radar places Scale in the
  Status section). Node: see the Node bullet below. Plus Services, Ingresses,
  ConfigMap/Secret (with explicit reveal), storage, CRDs, HPA, Jobs (with
  Suspend/Resume), events, generic CRDs.
- **Node** — Radar's node composition: an **Issues** banner when a condition is
  genuinely failing (NotReady, Disk/Memory/PID pressure, NetworkUnavailable — a
  cordoned node is not an error and gets its own calm **Cordoned** banner
  instead), then Status (pill, schedulable, roles, age), Node info (OS,
  architecture, kernel, container runtime, kubelet), Capacity cards with
  Capacity / Allocatable / **In use** rows, Resource usage (live metrics.k8s.io
  CPU and memory against allocatable, or the exact reason the API is absent),
  **Pods on this node** (live `spec.nodeName` list with status badges, first 30
  then “Show all”, click opens the Pod, count in the header), Addresses,
  Platform (instance type, zone, region, node pool, machine family — only when
  those labels exist), Taints and Conditions. Cordon/Uncordon, Drain and
  **Debug shell** stay in the drawer's kind-action row (and the row menu).
- **Permissions via ServiceAccount** — Radar's reverse-lookup section at the
  bottom of Pod and workload Overviews: `Permissions via ServiceAccount: <name>`
  with the one-line summary (`N direct bindings · N inherited via groups · N
  distinct rules`, `(truncated)` past 500), the five most permissive rules as
  verb/resource/api-group chips, and a **Blast radius** banner (cluster-admin,
  cluster-wide verb wildcard, escalation verbs, cluster-wide `create pods`)
  that auto-expands the section only when something is actually risky. Data
  comes from the `kube:rbac-subject` IPC (Role/ClusterRole/RoleBinding/
  ClusterRoleBinding lists behind a 10s per-cluster snapshot, implicit
  `system:authenticated` / `system:serviceaccounts[:ns]` groups folded in); a
  denied read is a calm note, not an error.
- **Service** — Radar's composition: a **Load balancer pending** warning while
  a LoadBalancer has no ingress yet, an info banner when the Service has **no
  pod selector**, then Service (type, IPs, load balancer, session affinity,
  external/internal traffic policy, IP families), Ports as a five-column table
  including NodePort, Selector, and an **Endpoints** section listing ready
  (green) and not-ready (amber) addresses from the live `Endpoints` object —
  with honest states for "no object yet" and read failures.
- **Access Control** — Radar's reverse-lookup sections, all from the same RBAC
  snapshot as the Permissions section: a ServiceAccount shows **Permissive
  grant detected**, **Direct bindings**, **Inherited via &lt;group&gt;**,
  **Effective permissions** (flat rule chips, capped), **Used by Pods**
  (live `spec.serviceAccountName` list), **Configuration**, **Workload
  identity**, **Secrets** and **Image pull secrets**; a Role/ClusterRole shows
  **Wildcard permissions**, **Bindings** (who is bound, subject chips with
  clickable ServiceAccounts) and **Rules** as cards (verbs / resources / API
  groups / resource names / non-resource URLs) plus the aggregation rule; a
  RoleBinding shows **No subjects** and **Wide grant** banners, the cluster
  scope note, **Role reference**, **Rules granted** (resolved live, with
  orphan-binding and 403 states) and **Subjects** cards.
- **Policy** — Radar's per-resource policy section on Pod and workload
  Overviews: findings come from the cluster's `PolicyReport` /
  `ClusterPolicyReport` families (whichever discovery finds), so a cluster
  without a policy engine renders nothing at all. Failures open the section
  with `Fail`/`Warn`/`Error`/`Skipped` badges, policy · rule and message, plus
  `N other checks passing`; "no policy applies", "not checked yet" and denied
  report families each say so in their own words instead of looking clean.
- **Secret / ConfigMap** — Secrets add a **Certificate** section (subject,
  issuer, not-before, coloured expiry) with an expired/expiring banner, and
  both kinds show an **Immutable** banner when the flag is set.
- **Custom resources** — the Overview leads with the live status badge and
  reads `status` in Radar's fixed order (phase, state, replicas, … then
  alphabetically) as flat rows, with a collapsed **Status details** block for
  nested objects.
- **Helm** — the Helm group's releases open a dedicated Overview: status badge
  (deployed/failed/pending/…), revision, chart and app version, deployed time,
  the owning Secret, then the deployed **Values** and rendered **Manifests** in
  scrollable blocks (capped at 200k characters). There is no API resource
  behind a release, so the other tabs, Create and Delete are not offered.
  - **Revisions** — Radar's timeline: a numbered circle (current = green),
    status badge, `Current` chip, deployed time/age and description, with
    **View** (swaps values/manifests to that revision behind a "Viewing
    revision N" banner) and an amber **Rollback** (non-current revisions only)
    behind a confirm.
  - **Resources** — every object the manifest creates, as clickable rows that
    open in the drawer.
  - **Rollback** re-applies the target revision's stored manifest and then
    appends a new revision record (append-only history, Helm's own model); the
    secret keeps Helm's `…<name>.v<N>` naming and labels.
  - **No upgrade**: rendering a chart needs Helm's template engine, which mLens
    does not ship — values are read-only here by design, not by omission.
- **Details** — metadata, owner references, labels, annotations, raw spec/status.
  The **Owner chain** walks owner references upward (owner → its owner → …,
  eight levels, cycle- and fetch-capped) and renders the whole path as one
  scrollable column: every level is a clickable row with its live status badge,
  and an owner that no longer exists (or cannot be read) is marked instead of
  silently dropped. **Labels** and **Annotations** each carry an *Edit* button
  (also in the row menu): a `key=value`-per-line editor where `-key` removes a
  key, followed by a confirm step that spells out `+N set / −N removed` before
  the merge patch is sent.
- **YAML** — Monaco, read-only by default, edit + dry-run + apply. Search is
  Monaco's own find widget (the contribution is registered in `lib/monaco.ts`,
  exactly as Radar registers it): `Ctrl/Cmd+F` opens it with match case, whole
  word, **regex**, the `n of m` counter, next/previous and replace; replace is
  disabled while the editor is read-only. The toolbar's Find/Replace buttons
  trigger the same widget, and `lib/monaco.ts` also bundles the codicon font
  the widget draws its chevrons and arrows with. **Indentation folding** is
  registered as well: the gutter chevrons (and `Ctrl+Shift+[` / `]`) collapse
  and expand YAML blocks.
- **Events** — live event list, warning filter, search, counts, timestamps.
- **Related** — owners/selectors/config/node/volume relationships, refreshed
  from the live API; empty state says when nothing is related. Owner references
  are opened with their own apiVersion and without a namespace, so cluster-scoped
  owners (e.g. CAPI `PinataHost`) resolve correctly. A sticky filter bar narrows
  the list — substring or regex over kind/name/namespace/relation/status — with
  kind chips as facets and `visible / total` counts in every group header. The
  bar renders whenever there is anything to filter, including single-group
  kinds such as a Node's Pods-on-node list.
- **Logs** — available for **Pods only**; container, tail, follow, previous,
  timestamps, search, download, clear, line numbers. `Ctrl/Cmd+F` opens the
  search, matched text is highlighted in place (browser-find style) and matching
  lines are kept; the bar shows an `N / M` counter with **↑/↓ buttons**
  (Enter / Shift+Enter) that walk the matches, scroll the line into the centre
  and pause auto-follow. Lines are tinted by level — crit/fatal/panic on red, error on
  a lighter red, warn on amber, all with a background tint so a scan down the
  column reads the severity without reading the words.
- **Environment** — Pod containers and init containers, env vars, `envFrom`,
  secret/configMap/field references. Ref badges have an eye that fetches the
  referenced ConfigMap/Secret and shows the decoded value inline (no navigation).
- **ConfigMap / Secret** — the resource name and key count sit above the value
  table, each key is stacked over its value (not side by side), values render in
  a line-number gutter, and a type header shows `type`/`kind`, key counts and
  size. Secret values
  are decoded for editing and encoded back on save; add/remove keys with a merge
  patch.
- Specification/Status fields are sorted; complex objects/arrays are collapsed
  JSON blocks so the drawer never grows to a multi-thousand-pixel page.
- **Metrics** — real metrics.k8s.io usage for **Pods only**; when the API is
  absent the panel says exactly that. No synthetic numbers; historical charts are
  not implemented.

### 3.6a Port forwarding

- A Pod action opens a start dialog (random local port 30000–65355 by default, pod port), creates a
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
- The terminal context launcher can target any connected cluster session, not
  just the active workspace. For pod exec it lists pods in the chosen namespace
  (limit 1000, alphabetical) and their containers through the same live API, so
  no terminal feature depends on kubectl.
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

A per-cluster **Overview** page (the first entry in the sidebar, and the default
landing view after connecting) mirrors Radar's home: nodes ready, pod and
workload counts, warning events, CPU/memory capacity totals, API-kind/CRD
surface, and quick links into resource kinds. Counts use the cheap
`limit=1` + `remainingItemCount` path and refresh at the normal polling interval
while the page is visible.

Drain (Nodes) previews a live plan before acting: pods on the node, DaemonSet and
mirror pods kept, emptyDir/hostPath and unmanaged pods flagged, optional cordon,
then eviction through the `policy/v1` Eviction API (falling back to delete on
clusters without it). `Set image` edits container and init-container images of the
pod template; CronJob `Trigger` creates a one-off Job from `jobTemplate`.

A per-cluster **Overview** page (first entry in the sidebar, default landing view
after connecting) mirrors Radar's home: nodes ready, pod/workload counts, recent
warning events, CPU/memory capacity totals, API-kind/CRD surface and quick links
into resource kinds. Counts use `limit=1` + `remainingItemCount` and refresh at
the normal polling interval while the page is visible.

Switching is done from the cluster tab strip, the hotbar, catalog, command
palette or settings. Open resources switch from the resource tab strip. The
catalog remains one click away (`Home`).

Opening a cluster switches to its tab **immediately**, before the API answers:
the workspace mounts with an `idle` session and plays the connecting animation
(ringed tile, sweep, staged steps — "Contacting the API server / Loading
namespaces / Discovering API resources") for the whole connect + discovery.
Failures land on the workspace's error screen with Retry / Back to catalog
rather than leaving the catalog up with only a toast.

A **Node debug shell** starts from the drawer's action row or the row menu: a
dialog shows an editable manifest (privileged pod pinned to the node, host
PID/network/IPC, host root at `/host`, `sleep infinity`) so image, namespace,
command or security context can be reassigned first, then Apply waits for the
pod to reach Running and attaches an exec console in the bottom dock. The pod
is labelled `mlens.io/debug-node` and is deleted when that tab closes.

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
