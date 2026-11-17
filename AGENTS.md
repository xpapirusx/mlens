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
  sidebar tree, sibling resource tabs, bottom dock, right details drawer, keyboard
  model, state preservation.
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
    resource-details/          Lens drawer + Radar content + resource tabs
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
- `details { ref, tab }`, `detailsHistory`, `resourceTabs`;
- `dock { open, height, tabs, activeTabId }`.

`catalog-store` holds settings, kubeconfig sources, `allClusters`, visible
`clusters`, health, active cluster, connect/disconnect, hidden clusters.

Important:

- **One mounted `ClusterWorkspace` per visited cluster**, hidden with CSS when
  inactive. Do not replace this with unmount-on-switch; terminal PTYs, scroll and
  drawer state must survive cluster switching.
- Never return a new array/object from a Zustand selector. Select stable slices
  (e.g. `state.sessions`, then `Object.keys` in render). Derived arrays in a
  selector cause React error #185 (infinite loop).
- Column widths and column order are **global settings**, keyed by
  `<kind>|<column>` and `<apiVersion>|<kind>`, so they survive cluster switches.
- Group expansion and favorite kinds are settings/session state, never local
  component state that resets on navigation.

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
- Counts use `limit=1` + `remainingItemCount`. Fetch counts only for expanded
  sidebar groups / favorites, not all 200 kinds. Poll at ≥120s.
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
  shell-out to kubectl.
- Terminal shells get a generated, context-pinned kubeconfig (0600) via
  `KUBECONFIG`; never modify the user's kubeconfig.

---

## 6. UI rules

- Follow Radar tokens: `bg-theme-base/surface/sidebar/elevated`, text tokens,
  `border-theme-border`, status classes, `.badge`, `.card-inner`, `.dialog`.
  Never use raw Tailwind gray/blue for themed surfaces.
- Typography: DM Sans / DM Mono. Table header 12px uppercase; rows 14px; details
  section text 13px; console/log text 11–13px monospace.
- Table: 44px rows by default (configurable 24–52), 40px header, fixed layout,
  always-visible selection checkbox, column resize (72px min), horizontal scroll,
  column visibility and order, filters/search/sort.
- Status: semantic tone only (`success/warning/error/info/neutral`). Use
  `resourceStatus` and `StatusBadge`; do not invent status strings ad hoc.
- Catalog: clusters with a live session (open) sort to the top; Status says
  **Connected**, not the Kubernetes version (version has its own column). A sort
  control offers open/status, name, recent and kubeconfig source.
- Sidebar order (Freelens): Favorites, Nodes, Workloads, Config, Network, Storage,
  Namespaces, Events, User Management, Custom Resources. Nodes/Namespaces/Events
  are direct rows. Custom Resources contains Definitions + one child per API group.
- Custom resources and CRD definitions open on **Details** by default (Freelens
  field order); their Overview is still one click away and uses Radar-style cards.
- Details lives in the right drawer; tabs are Overview / Details / YAML / Events /
  Related / Logs (Pods only) / Metrics. Kind actions are labelled buttons in a
  right-aligned row under the resource name (Logs/Exec/Forward for Pods; Scale/Restart/Set image for
  workloads; Pause/Resume for Deployments; Suspend/Resume and Trigger for
  Jobs/CronJobs; Cordon/Uncordon and Drain for Nodes). Delete, Reload, Expand
  and Close stay in the header; Delete sits next to Close. Reload (clockwise
  arrow) only refetches data — Restart uses the counter-clockwise arrow. YAML
  and Related are tabs. Workload Scale also appears in the Overview Status
  section, as in Radar.
- Resource tabs (open resources) and cluster tabs (open clusters) are separate
  rows. Do not turn the app into a browser-style single tab bar. The open-resource
  strip can collapse into a shadow tray above the terminal dock; the tabs stay
  mounted and clickable so the strip can be restored at any time.
- Hotbar: 10 slots **per page** on a 75px rail with 40px tiles and 12px spacing
  (Freelens), favourite clusters only, three-letter short names, seeded solid
  colours, status LED, drag/context-menu repositioning; never gradient avatars.
  Pages are Freelens-style: `‹ N ›` arrows plus a badge menu (switch / new /
  remove page, max 12), overflow favourites flow into later pages, and the tile
  list scrolls with a hover-only scrollbar.
- Terminal surface stays dark in every theme; Dracula/Freelens themes select the
  corresponding ANSI palette. Logs are Pod-only.
- Dock: the plus opens a local shell in the active context; the chevron and
  `⌘⇧T` open the context launcher (any connected cluster, namespace, pod exec,
  container, shell). Keep the one-click plus behaviour.
- Window dragging: the shell root is `-webkit-app-region: drag`; every
  interactive control, table row, scroll area, terminal and editor must stay
  `no-drag` (or be excluded by the global rule) so selection and scrolling work.
- The details drawer can be minimized without closing it: keep the resource
  tabs, set `detailsMinimized`, and restore from the floating pill.
- No huge components. Split table/controls/filters/dialogs/renderers.
- No dead buttons. If not implemented, label it explicitly.

---

## 7. Themes and design system

- Radar (default light/dark) — `styles/tokens.css` + `theme.css`.
- Dracula — `styles/themes.css` (`html.theme-dracula`), terminal palette in
  `TerminalView.tsx`.
- Freelens — `html.theme-freelens`, teal accent, Freelens terminal palette.
- Theme classes are applied by `AppShell` from `settings.colorTheme`; Dracula and
  Freelens force dark mode. Do not add theme-specific one-off component styles;
  extend tokens.

---

## 8. Commands

```bash
pnpm install         # postinstall fixes node-pty spawn-helper permissions
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
5. **Zustand selectors returning new arrays** cause infinite loops (React #185).
6. **Hidden cluster workspaces** keep watches and mounted terminals; polling is
   disabled for inactive workspaces. Do not "optimize" by unmounting them.
7. **Port-forward protocol**: server sends the port handshake; client must not
   send it. Empty replies usually mean an extra prefix was sent.
8. **CSP** restricts workers to self/blob (Monaco) and connections to localhost.
9. **Metrics API** may be absent/forbidden; never substitute values.
10. **Catalog removal** is non-destructive (`settings.hiddenClusters`); never
    delete or rewrite the user's kubeconfig.

---

## 10. Definition of done

- Typecheck + production build pass.
- Feature works against a real cluster, or clearly reports why it cannot.
- No mock data, no dead controls, no placeholder pages.
- Design follows Radar tokens/density; shell follows Freelens structure.
- State survives cluster switching and, where applicable, app restart.
- Docs updated when behaviour/settings/architecture change.
- New IPC is in the shared contract and validated in main.
- Destructive actions confirm and never touch user kubeconfig files.
