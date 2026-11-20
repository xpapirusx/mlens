# PROJECT_CONTEXT.md — mLens for the next agent

Этот файл — карта проекта и его потоков данных. Он дополняет `AGENTS.md`
(правила работы), `ARCHITECTURE.md` (технический контракт) и `DESIGN_SPEC.md`
(продуктовый дизайн). Если возвращаешься к проекту после паузы, начни здесь.

## 1. Что это за приложение

mLens — standalone Electron Kubernetes IDE на TypeScript/React. Один процесс
Electron-приложения, без Go-бэкенда, без kubectl/helm, без Docker. Пользователь
импортирует kubeconfig; приложение само говорит с Kubernetes REST/WebSocket
через `@kubernetes/client-node` и собственный `kubeRequest`.

Оболочка — Freelens: hotbar, cluster tabs, sidebar, таблица, dock, editor area.
Визуальный язык — Radar: токены, DM Sans/DM Mono, плотные таблицы, details.

## 2. Карта процессов

```
main (ESM, Node)
  ├─ settings            JSON 0600, defaults, sanitisation, reset
  ├─ kubeconfigs         sources, contexts, terminal kubeconfig export
  ├─ ClusterManager      list/get/counts/patch/apply/delete/pod containers
  ├─ ResourceWatcher     per-subscription watch + reconnect + RV
  ├─ LogStreams          pod logs → IPC chunks
  ├─ ExecSessions        exec WebSocket + resize
  ├─ PortForwardManager  loopback TCP ↔ Kubernetes port-forward WS
  └─ PTY                 local terminals через node-pty
        │
        ├─ preload (CJS, sandboxed bridge): window.mlens
        │     app / clusters / resources / logs / exec / terminal / settings
        │
        └─ renderer (React 19, sandboxed)
              catalog-store   settings, sources, clusters, active/split, health
              session-store   one ClusterSession per visited cluster
              features/*      UI; всё через lib/api.ts и stores
```

Правило: **renderer не импортирует Node/Electron**. Любой доступ к Kubernetes,
файлам, PTY, порт-форвардам и настройкам идёт через IPC (`src/shared/ipc.ts`),
типы — `src/shared/types.ts`, обработчики — `src/main/ipc/register.ts`.

## 3. Startup и настройки

1. `main/index.ts` создаёт окно, `SettingsStore`, `KubeconfigManager`,
   `ClusterManager` и регистрирует IPC.
2. `SettingsStore` читает `userData/settings.json`; при старте также подмешивает
   существующие файлы из `KUBECONFIG` в `kubeconfigPaths`.
3. Renderer `catalog-store.loadSettings()/loadCatalog()` подтягивает настройки,
   kubeconfig sources и кластеры.
4. `AppShell` применяет тему, `--font-sans`, `--font-scale`; catalog при
   отсутствии активного кластера.
5. Настройки по умолчанию — `defaultSettings()` в `src/main/settings/store.ts`.
   `settings.reset()` сбрасывает предпочтения, **сохраняя только imported
   kubeconfig paths**.

## 4. Подключение кластера

`openCluster(id)` в `lib/cluster-actions.ts` → `catalog-store.connect()` →
IPC `clusters.connect` → main создаёт **отдельный `KubeConfig`** под контекст,
`ClusterConnection` с discovery/catalog. Renderer `session-store.initialize()`
проходит стадии `api → namespaces → discovery → done`; каждая стадия видна на
экране Connecting.

`ResourceCatalog` держит индекс `apiVersion|kind → ApiResourceInfo`; discovery
(`/api`, `/apis`, CRDs) кешируется на 5 минут и дедуплицирует in-flight.
Kind — не identity: CRD может называть себя `Node`/`Service`, поэтому built-in
статусы/колонки/действия проверяют API group (`isBuiltinApiVersion`).

## 5. Поток списка ресурсов

```
ResourceBrowser
  selected kind + namespaces
        ↓
useResourceList
  list (limit 2000) → items + continueToken + resourceVersion
  watches per namespace → batched WatchEventBatch → applyWatchEvents
  load more / loadAll (search) → appendPage (dedupe by uid)
        ↓
filtered memo (search/problems/column filters + problemCount)
        ↓
sortObjects (sort value once per row, numeric collator, status/age caches)
        ↓
ResourceTable (virtualizer, only visible + overscan)
        ↓
TableRow (memoized; stable callbacks; layout values memoized)
```

Ключевые правила:

- Polling — **fallback**: `useResourceList` не поллит list, пока watch live.
  Helm (synthetic release secrets) не имеет watch и поллит всегда.
- P2: при refresh с тем же `uid + resourceVersion` object references
  переиспользуются; `appendPage` не добавляет объект, который watch уже принёс.
- `loadAll` включается при поиске/фильтре; страницы идут по continue token,
  максимум 20.
- Сортировка: session `kindState.sort` → saved `settings.tableSorts` → default
  Age desc. Возраст сортируется числом; статус/remaining кэшируются.
- Ширины/порядок колонок — глобальные настройки по
  `<apiVersion>|<kind>|<column>` и `<apiVersion>|<kind>`; при первом ресайзе
  фиксируются все видимые ширины, чтобы соседние колонки не уезжали.
- Watch-события объединяются в main (`WatchEventBatcher`, ~150 мс/250 событий).
  Не ломать: это защищает от render-per-event.
- Скрытые cluster workspaces остаются смонтированными, watch живут, polling
  выключен. Не заменять на unmount.

## 6. Stores и React-инварианты

- `session-store`: `sessions[clusterId]` содержит namespaces, resources,
  per-kind state (`search/regex/sort/filters/hiddenColumns/pinnedColumns`),
  editor (panes/tabs/history/minimized/width/split), dock.
- `catalog-store`: settings, sources, allClusters/clusters, activeClusterId,
  splitClusterId/direction/ratio, health, favorites/hidden, compareSelection.
- **Никогда не возвращать новый массив/объект из Zustand selector.** Берите
  стабильные поля; для производных массивов — `Object.keys`/memo в компоненте.
  Это причина React #185.
- Для chrome (TopBar, ClusterTabs, Hotbar, CatalogPage, Settings) используется
  `useChromeSessions()` — стабильная подпись; не подписывайте их на весь session.
- Polled hooks обязаны сохранять identity Map/массива при неизменном
  содержимом (`lib/stable.ts`), иначе таймер пересчитывает все memo.

## 7. Details, editor, dock

- Ресурс открывается в editor area: 1–4 panes, per-pane tab strip, история,
  Split right/down, minimize в tray. Details — не модалка.
- Tabs: Overview / Details / YAML / Events / Related / Logs (Pod) / Metrics.
  Custom resources по умолчанию открывают Details; built-in — Overview.
- Overview содержит kind-specific секции; Details — metadata/owner/spec/status;
  YAML — Monaco; Related — relationships; Logs — только Pod.
- Детали опрашивают объект (≤15 с) с сохранением identity по resourceVersion.
- Dock: local shell (node-pty) и pod exec (WebSocket). `⌘T` local, `⌘⇧T`
  context launcher. Terminal tabs stay mounted.
- Port-forward: loopback TCP → Kubernetes WebSocket; сервер присылает 2-байтовый
  port handshake, клиент его **срезает и не отправляет**.
- Логи: массив строк + partial tail, cap 20 000, flush 160 мс, virtualizer;
  поиск с regex/case/only/hide, structured JSON/logfmt, ANSI, timestamps.
  Не возвращать monolithic text.

## 8. Настройки и сброс

`AppSettings` — единый JSON в `userData/settings.json` (0600). Все поля
санитизируются в `src/main/settings/store.ts`; новое поле надо добавить в
`src/shared/types.ts`, `defaultSettings()`, `sanitize()`, форму Settings и
`ipc`/preload, если нужен отдельный вызов. `reset()` сохраняет только
`kubeconfigPaths`; остальное возвращает к defaults.

## 9. Проверка и запуск (macOS в приоритете)

Автоматических unit/e2e-тестов в репозитории нет. Обязательный минимум после
каждого изменения:

```bash
pnpm typecheck   # tsc node + web
pnpm build       # typecheck + electron-vite build
```

Запуск:

```bash
pnpm install            # macOS/Linux/Windows (PowerShell: pnpm install)
pnpm dev                # HMR, открывает окно Electron
pnpm start              # запускает уже собранный out/ (после pnpm build)
```

macOS:

- Node 22+ и pnpm; Electron 45.3.3. Если `pnpm dev` падает с
  `Error: Electron uninstall`, выполните `node node_modules/electron/install.js`
  (или `pnpm install` онлайн) — это чинит отсутствующий runtime.
- `pnpm dev` — единственный способ проверить HMR. Если проверяете собранный код,
  сначала `pnpm build`, затем `pnpm start`; не путайте старое окно dev с новым
  build.
- Останавливать dev — `Ctrl+C`; если процесс завис, ищите
  `pgrep -fal "helmcharts/mlens/node_modules.*Electron"` и завершайте
  родительский Electron PID.
- Для проверки терминалов нужен исполняемый `node-pty` spawn-helper; при
  `posix_spawnp failed` — chmod helper или `pnpm install`.

Windows/Linux: те же `pnpm typecheck`/`pnpm build`; `dist:win`/`dist:linux`
только для упаковки. Не запускайте macOS-only `Electron.app` пути на других ОС.

Ручной smoke-тест перед сдачей:

1. `pnpm dev` → каталог открывается, кластер подключается.
2. Открыть Pods → таблица, сортировка, поиск, фильтр, Load more.
3. Открыть Pod → Overview/Details/YAML/Logs; вернуться.
4. Переключить кластер → состояние таблицы/док/редактор сохраняется.
5. Если менялись настройки — Settings, тема, шрифт, Reset.
6. Если менялся main/Kubernetes слой — проверить реальный кластер или явно
   написать, почему это невозможно.

## 10. Debugging и профилирование (CDP)

Для проверки реальной логики без изменения кода запускаем **собранное**
приложение с удалённым отладчиком:

```bash
pnpm build
pnpm debug:app                      # electron --remote-debugging-port=9222 .
pnpm debug:cdp --list               # helper ниже, -- передаётся скрипту
```

На macOS это открывает окно mLens; `pnpm dev` для HMR остаётся отдельным
режимом. **Важно:** приложение single-instance (`app.requestSingleInstanceLock`).
Если mLens уже открыт, новый запуск только сфокусирует существующее окно и
выйдет — порт 9222 не откроется, хотя в логе будет `DevTools listening`.
Поэтому перед дебагом закройте запущенный экземпляр либо запускайте отдельный
профиль с `--user-data-dir=/tmp/mlens-debug`. После проверки окно нужно
закрыть/завершить процесс.

Проверить, что порт жив: `curl -s http://127.0.0.1:9222/json/list`.

### Точечные запросы к renderer

В репозитории есть helper `scripts/debug-cdp.mjs` — он подключается к первой
page-цели через CDP и печатает результат `Runtime.evaluate`:

```bash
pnpm debug:cdp --list
pnpm debug:cdp "window.mlens.app.info()"
pnpm debug:cdp "window.mlens.app.metrics()"
pnpm debug:cdp "performance.memory.usedJSHeapSize"
pnpm debug:cdp "document.querySelectorAll('[role=row]').length"
pnpm debug:cdp --file ./probe.js
```

Эквивалент без pnpm: `node scripts/debug-cdp.mjs "<expr>"`.

`window.mlens` — тот же типизированный preload API, что использует renderer:
`clusters`, `resources`, `logs`, `exec`, `terminal`, `settings`, `app`.
Примерами можно проверять IPC/логику без кликов:

```js
window.mlens.clusters.listKubeconfigs()
window.mlens.resources.list({ clusterId, apiVersion: "v1", kind: "Pod", limit: 2000 })
```

### Протыкание UI

Store-модули не висят на `window`, поэтому UI-сценарии воспроизводятся через
DOM (или React DevTools в dev-режиме):

```js
// открыть Pods в текущем кластере
[...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Pods")?.click()

// нажать Load more (если есть)
[...document.querySelectorAll("button")].find(b => /Load \d+ more/.test(b.textContent))?.click()

// проверить виртуализацию и выделение
document.querySelectorAll('[role=row]').length
document.querySelector('[role=row] input[type=checkbox]')?.click()
```

В `pnpm dev` окно можно открыть через DevTools (`⌥⌘I` на macOS) и ставить
breakpoints в TS/React; в собранном приложении тот же renderer доступен через
CDP-порт. `console.log` из main виден в терминале/логе Electron, а не в
renderer-консоли.

### Профиль

Через тот же порт (`pnpm debug:cdp "<expr>"`) снимаем:
- `window.mlens.app.metrics()` — суммарные CPU/RAM Electron;
- `performance.memory.usedJSHeapSize` — JS heap renderer;
- `document.querySelectorAll('[role=row]').length` — виртуализация;
- `document.querySelectorAll('*').length` — DOM.

Сценарий: каталог idle → подключить кластер → Pods → Load more до 8–10k →
idle 30 с → scroll → сортировки Name/Status/Age → Select All → открыть детали.
Результаты пишите в `PERFORMANCE_OPTIMIZATION_PROPOSALS.md` и
`RESOURCE_TABLE_PERFORMANCE_PROPOSALS.md`; не заявляйте проценты без замеров.
После профиля закрывайте окно/процесс.

## 11. Где что менять

| Задача | Файлы |
|---|---|
| Новая колонка/статус | `lib/columns.tsx`, `lib/status.ts` |
| Список/watch/paging | `useResourceList.ts`, `main/kubernetes/resource-watcher.ts` |
| HTTP/auth/list | `main/kubernetes/http.ts`, `cluster-manager.ts` |
| Discovery | `main/kubernetes/discovery.ts`, `session.ts` |
| Failure/политики | `lib/status.ts`, `PolicySection.tsx` |
| Details/Overview | `features/resource-details/*` |
| Редактор/табы | `features/editor/*`, `stores/session-store.ts` |
| Логи | `features/resource-details/logs/*`, `main/kubernetes/log-streams.ts` |
| Exec/терминал | `main/kubernetes/exec-sessions.ts`, `terminal/*` |
| Port-forward | `main/kubernetes/port-forwards.ts`, `features/port-forward/*` |
| Тема/шрифты | `styles/themes.css`, `lib/monaco.ts`, `lib/fonts.ts`, Settings |
| IPC-контракт | `shared/ipc.ts`, `shared/types.ts`, `preload/index.ts`, `main/ipc/register.ts` |

## 12. Хрупкие места

- Не поллить list при живом watch; fallback-poll — только для Helm/watch error.
- Не возвращать новые массивы из селекторов; не unmount-ить скрытые workspace.
- Не заменять watch/polling без профиля; не добавлять глобальные кеши 8k
  объектов.
- Не менять поведение Select All/фильтров: выбор живёт в `selectedKeys`,
  «visible» — результат текущего `sorted`.
- Не трогать `WatchEventBatcher`, `reconcileItems`, `appendPage`, K1 in-flight
  coalescing без причины.
- Осторожно с `localeCompare` и `resourceStatus` в горячих путях: используются
  кеши/`Intl.Collator`; не возвращайте O(n log n) на каждый watch.
- Секреты/креды никогда не уходят в renderer; не логируйте их.
