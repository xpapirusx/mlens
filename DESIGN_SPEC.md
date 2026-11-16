# mLens — Design Specification

**Статус:** v1.0 (living document)
**Референсы:** [Freelens](https://github.com/freelensapp/freelens) (MIT) · [Skyhook Radar](https://github.com/skyhook-io/radar) (Apache-2.0)

---

## 1. Концепция

mLens — самостоятельная desktop Kubernetes IDE на Electron + React 19 + TypeScript.

Главный принцип — **разделение слоёв наследования**:

> **Скелет приложения — Freelens. Визуальный язык и Kubernetes UX — Radar.**

Freelens определяет *где* и *как* расположены элементы интерфейса и как ими управляют.
Radar определяет *как эти элементы выглядят* и *что внутри Kubernetes-панелей*.

Это не гибрид «на глазок», а два непересекающихся контракта:

| Слой | Источник | Что именно наследуется |
|---|---|---|
| Application Shell | **Freelens** | Компоновка окна: top bar, hotbar (icon rail), sidebar, tab strip, statusbar, dock |
| Window Management | **Freelens** | Кастомный titlebar, min/max/close, состояние окна, single-window desktop-модель |
| Navigation | **Freelens** | Welcome → Catalog → Cluster page; вкладки ресурсов; back/forward; дерево навигации в sidebar |
| Welcome Screen | **Freelens** | Список кластеров, избранное, недавние, добавление kubeconfig, настройки |
| Cluster Catalog | **Freelens** | Каталог contexts из нескольких kubeconfig, подключение/отключение, статус |
| Multiple Clusters | **Freelens** | Изолированная сессия на кластер, сохранение состояния вкладок при переключении |
| Resource Browser | **Radar** | Плотные таблицы, колонки, фильтры, поиск, счётчики, namespace-фильтр |
| Resource Tables | **Radar** | Высота строк, типографика, бейджи статусов, формат age, density |
| Resource Filters | **Radar** | Механика поиска/фильтрации/сортировки, индикаторы состояния |
| Resource Details content | **Radar** | Overview/Details/YAML/Events/Logs/Related — содержимое в стиле Radar внутри окон Lens |
| Typography | **Radar** | DM Sans / DM Mono, размеры, начертания |
| Icons | **Radar** | Иконки и их стилистика (lucide-подобная линейная графика) |
| Colors | **Radar** | Палитра поверхностей, семантика статусов, brand blue |
| Terminal appearance | **Radar** | Тёмная консольная поверхность, ANSI-палитра, компактный chrome |
| Terminal integration | **Freelens + Radar UX** | node-pty в main-процессе, xterm.js в renderer, вкладки терминала в dock |

**Запрещено:** Go-бэкенд, отдельный сервер, Docker, mock-данные в готовых функциях, вкладки/окна в стиле Radar, таблицы в стиле Freelens.

---

## 2. Лицензии и переиспользование

| Проект | Лицензия | Следствия для mLens |
|---|---|---|
| Freelens | MIT | Свободное переиспользование кода и структуры; сохранить copyright-notice |
| Skyhook Radar | Apache-2.0 | Переиспользование разрешено; **обязательно** сохранить NOTICE/атрибуцию при копировании токенов, значений и кода |

Правило: mLens **не форкает** ни один из проектов. Мы изучаем исходники и создаём собственную реализацию. Числовые дизайн-токены и отдельные UX-решения, взятые из Radar, атрибутируются в `THIRD_PARTY_NOTICES.md` (файл уже упоминается в `tokens.css`).

---

## 3. Технологический стек

- **Electron** (main + preload + renderer), сборка `electron-vite` + `electron-builder`
- **React 19**, **TypeScript**
- **Zustand** — состояние renderer (кластерные сессии, вкладки, подписки watch)
- **@kubernetes/client-node** — Kubernetes API из main-процесса
- **xterm.js** + **node-pty** — терминал и pod exec
- **Monaco** — YAML viewer/editor
- **Tailwind CSS 4** + CSS custom properties — дизайн-токены
- **@tanstack/react-virtual** — виртуализация таблиц
- **lucide-react** — иконки (стилистика Radar)

Вся бизнес-логика — TypeScript. Main-процесс отвечает за привилегированные операции (kubeconfig, API-запросы, pty, exec); renderer общается только через типизированный IPC-контракт (`src/shared/ipc.ts`).

---

## 4. Архитектура

```
src/
├── main/                      # Electron Main Process
│   ├── index.ts               # Окно приложения, lifecycle
│   ├── ipc/register.ts        # Регистрация всех IPC-хендлеров
│   ├── kubernetes/
│   │   ├── kubeconfig.ts      # Парсинг/список kubeconfig, contexts
│   │   ├── cluster-manager.ts # Реестр подключённых кластеров (сессии)
│   │   ├── session.ts         # Изолированная сессия кластера (kube client)
│   │   ├── discovery.ts       # API Discovery + CRD-обнаружение
│   │   ├── resource-watcher.ts# Watch-подписки, события в renderer
│   │   ├── log-streams.ts     # Потоки логов pod'ов
│   │   ├── exec-sessions.ts   # Pod exec (websocket → pty-подобный поток)
│   │   └── http.ts            # Прямые API-вызовы (list/get/delete/apply/scale)
│   ├── terminal/pty-manager.ts# Локальные shell-процессы (node-pty)
│   └── settings/store.ts      # Настройки приложения (persist)
├── preload/                   # Secure IPC bridge (contextBridge)
├── shared/                    # Типы, IPC-контракт, ключи каналов
└── renderer/
    ├── app-shell/             # Freelens-структура: topbar, hotbar, sidebar,
    │                          #   tab strip, dock, statusbar, layout
    ├── design-system/         # Radar-токены + переиспользуемые компоненты
    └── features/
        ├── welcome/           # Welcome Screen (Freelens)
        ├── catalog/           # Cluster Catalog (Freelens)
        ├── clusters/          # Сессии кластеров, multi-cluster state
        ├── navigation/        # Freelens-навигация: вкладки, back, дерево
        ├── resource-browser/  # Radar-таблицы, фильтры, поиск
        ├── resource-details/  # Radar-контент внутри Lens-механики вкладок
        ├── terminal/          # xterm.js: локальный shell + pod exec
        └── settings/          # Настройки
```

### IPC-модель

Единый контракт `MlensApi` (уже реализован в `src/shared/ipc.ts`): `app`, `clusters`, `resources`, `pods`, `logs`, `exec`, `terminal`, `settings`. Renderer не имеет прямого доступа к Node/K8s. Push-события (watch, логи, данные терминала) — только через `webContents.send` по перечисленным каналам.

### Multi-cluster sessions

- `ClusterManager` в main держит map `ClusterId → ClusterSession`; каждая сессия — собственный kube-config, client, watch-подписки, exec/log-потоки.
- В renderer — Zustand-стор на кластер: открытые вкладки, выбранные namespace, состояние фильтров, скролл. Переключение кластера не разрушает состояние остальных.

---

## 5. Application Shell (Freelens-структура)

Метрики shell (токены уже в `tokens.css`):

| Токен | Значение | Назначение |
|---|---|---|
| `--shell-topbar-height` | 44px | Верхняя панель: кастомный titlebar + строка управления |
| `--shell-hotbar-width` | 54px | Левый icon-rail (как hotbar в Lens) |
| `--shell-sidebar-width` | 236px | Дерево навигации кластера |
| `--shell-tabstrip-height` | 36px | Вкладки открытых ресурсов |
| `--shell-statusbar-height` | 24px | Статус подключения, версия, namespace |
| `--shell-dock-default-height` | 340px | Dock (терминал/логи) снизу, ресайзится |

### Компоновка

```
┌──────────────────────────────────────────────────────────┐
│ Topbar: traffic lights · breadcrumb · actions · ⚙        │ 44px
├────┬─────────────┬───────────────────────────────────────┤
│H   │  Sidebar    │  Tab strip (вкладки ресурсов)         │ 36px
│o   │  (дерево    ├───────────────────────────────────────┤
│t   │   навигации │                                       │
│b   │   Lens-     │   Рабочая область                     │
│a   │   структура,│   (Resource Browser / Details —       │
│r   │   Radar-    │    Radar-контент)                     │
│    │   стиль)    │                                       │
│54px│  236px      ├───────────────────────────────────────┤
│    │             │  Dock: терминал / логи (вкладки)      │ ~340px
├────┴─────────────┴───────────────────────────────────────┤
│ Statusbar: cluster · context · namespace · watch status  │ 24px
└──────────────────────────────────────────────────────────┘
```

### Механика (Freelens)

- **Welcome Screen** — стартовая страница без кластера: каталог, избранное, недавние, добавление kubeconfig (диалог/путь), быстрый connect, настройки.
- **Cluster page** — после подключения: hotbar + sidebar с деревом ресурсов, tab strip с открытыми ресурсами, dock.
- **Вкладки** — клик по ресурсу в таблице открывает вкладку; вкладки переключаются, закрываются (×), дубли не создаются; back-навигация внутри истории; состояние вкладок переживает переключение кластера.
- **Sidebar** — Lens-группировка: Cluster / Workloads (Pods, Deployments, StatefulSets, DaemonSets, ReplicaSets, Jobs, CronJobs) / Network (Services, Ingresses, NetworkPolicies) / Config (ConfigMaps, Secrets) / Storage (PV, PVC, StorageClasses) / Security/RBAC (SA, Roles, Bindings, ClusterRoles) / Policy (HPA, PDB) / Cluster (Nodes, Namespaces, Events) / **Custom Resources** (динамически из Discovery).
- **Контекстные меню** — правый клик на ресурсе: Edit YAML, Delete, Scale, Restart, Logs, Exec, Copy Name.
- **Dock** — панель снизу для терминала и логов, ресайз мышью, сворачивание, несколько вкладок.

### Стиль (Radar)

Все элементы shell рендерятся дизайн-системой Radar: DM Sans, компактные высоты, радиусы 6/8/10/14px, плоские поверхности без градиентов, brand blue `#4a7cc9`/`#6a9fe0`.

---

## 6. Design System (Radar-визуальный язык)

Источник токенов — `src/renderer/design-system/styles/tokens.css` (адаптация `radar/packages/k8s-ui/src/theme/variables.css`).

### Поверхности (светлая / тёмная тема, `light-dark()`)

| Токен | Light | Dark |
|---|---|---|
| `--bg-sidebar` | `#e7ecf5` | `#080b16` |
| `--bg-base` | `#f0f3f9` | `#0b0f1e` |
| `--bg-surface` | `#f8fbfe` | `#14192a` |
| `--bg-elevated` | `#e6ecf5` | `#1e2338` |
| `--color-brand` | `#4a7cc9` | `#6a9fe0` |

### Семантика статусов

`--color-success #22c55e` · `--color-warning #f59e0b` · `--color-error #ef4444` · `--color-info #3b82f6` · `--color-alert #f97316`

### Типографика

- UI: **DM Sans Variable** (400/500/600), 12–14px базовые размеры, компактные line-height.
- Данные/моно: **DM Mono** — имена ресурсов, age, IP, счётчики, YAML, терминал.

### Терминал

Тёмная поверхность в обеих темах (`--terminal-bg #0f172a`), собственная ANSI-палитра (16 цветов, light/dark варианты уже в токенах).

### Переиспользуемые компоненты (`design-system/`)

Button, IconButton, Badge/StatusDot, Tooltip, Menu/Dropdown, Tabs, Input, Select, Panel, Drawer, Dialog, VirtualTable, YamlViewer (Monaco), TerminalChrome, EmptyState, Spinner, Kbd.

**Анти-паттерны (запрещены):** SaaS-дашборд стиль, крупные карточки, градиенты, чрезмерные скругления, пустое пространство, декоративные элементы.

---

## 7. Resource Browser (Radar)

### Таблица

- Виртуализованная плотная таблица (`@tanstack/react-virtual`), высота строки ~32px, hover/selected состояния, моноширинный шрифт для идентификаторов.
- Колонки по типу ресурса (по образцу Radar):
  - **Pods:** Status · Name · Namespace · Ready · Restarts · Node · Age · IP
  - **Deployments:** Status · Name · Namespace · Ready · Up-to-date · Available · Age
  - **Nodes:** Status · Name · Roles · Version · CPU · Memory · Age
  - и т.д. — конфигурация колонок декларативная, per resource kind.
- **Status** — цветной dot + короткий текст (Running/Pending/Failed/Succeeded/Unknown), семантика Radar.
- **Age** — компактный человекочитаемый формат (`5m`, `3d12h`).

### Панель над таблицей

- Поиск (по имени/лейблам), фильтр по namespace (мультивыбор + «All»), сортировка кликом по заголовку, счётчик ресурсов, индикатор live-обновления (watch), кнопка обновления, кнопка «Create/Edit YAML».

### Данные

- `resources.discover(clusterId)` → полный список API-ресурсов, включая CRD (динамическое обнаружение, не жёсткий список).
- `resources.watch` → подписка; таблица обновляется инкрементально по `WatchEventPayload` (ADDED/MODIFIED/DELETED).
- RBAC-aware: недоступные ресурсы показываются с индикатором «нет прав», а не скрываются молча.

---

## 8. Resource Details (Radar-контент в Lens-механике)

Открытие: клик по строке → **вкладка** в tab strip (механика Freelens). Внутри вкладки — Radar-стилизованный контент.

### Общая структура

- Заголовок: имя (моно), kind, namespace, статус-бейдж, age, кнопки действий (Edit YAML, Delete, контекстные действия по kind).
- Секции/подвкладки (компактные, по образцу Radar): **Overview** · **YAML** · **Events** · **Logs** (для pod-подобных) · **Related** · **Conditions**.

### Pod Details

Основная информация (namespace, node, IP, QoS, priority) · container status'ы (image, ready, restarts, state) · conditions · events · logs (+ previous logs, выбор контейнера) · exec (открывает вкладку терминала в dock) · YAML · связанные Deployment/ReplicaSet/Service.

### Deployment Details

Replicas (desired/available/ready) · rollout status · conditions · дочерние ReplicaSets · Pods · events · YAML · конфигурация контейнеров.

### Node Details

Capacity/Allocatable · conditions · pods на узле · система (OS, runtime, version) · events.

### YAML

Monaco в режиме YAML: read-only viewer с переключением в режим apply (редактирование → `resources.apply`), подсветка, сворачивание.

---

## 9. Terminal

- **Внешний вид — Radar:** тёмная консольная поверхность, DM Mono, компактный chrome, ANSI-палитра из токенов.
- **Интеграция — Freelens:** терминал живёт в dock как вкладка, доступен из hotbar и из Pod Details (Exec).
- Реализация: `node-pty` в main (`pty-manager.ts`), xterm.js + addons (fit, search, web-links) в renderer, данные через IPC (`terminal:*`, `exec:*`).
- Возможности: несколько вкладок, локальный shell, pod exec (выбор контейнера), copy/paste, resize, поиск, hotkeys.

---

## 10. Kubernetes Integration (main-процесс)

- **Kubeconfig:** список источников (несколько файлов), добавление через диалог/путь, удаление; contexts → ClusterSummary.
- **Подключение:** `clusterConnect` создаёт изолированную `ClusterSession` (собственный kubeconfig-объект, client, watchers). Health-check, список namespaces, версия кластера.
- **Discovery:** `/apis` + `/api` → все ресурсы, включая CRD; группировка для sidebar.
- **CRUD:** list/get/delete/apply/scale/restart — через `@kubernetes/client-node` и прямые HTTP-вызовы.
- **Watch:** подписки с ресинком, события пушатся в renderer.
- **Logs:** потоковые, с фильтрацией по контейнеру, previous logs.
- **Exec:** websocket exec через client, мультиплексированный в IPC-сессию.

---

## 11. Сборка и дистрибуция

- `electron-vite` — dev/build (main, preload, renderer).
- `electron-builder` — installers: macOS (dmg, universal), Windows (nsis), Linux (AppImage/deb).
- Самостоятельный binary: пользователю не нужны Node.js, Go, Docker.
- Скрипты уже в `package.json`: `dev`, `build`, `dist`, `dist:mac|win|linux`.

---

## 12. Этапы разработки

| Этап | Содержание | Статус |
|---|---|---|
| 1. Исследование | Изучение Freelens и Radar, лицензии, таблица соответствия | ✅ (этот документ) |
| 2. Проектирование | Архитектура, токены, IPC-контракт | ✅ частично (кодовая база уже начата) |
| 3. Основной интерфейс | Electron app, Welcome, Catalog, kubeconfig, подключение, multi-cluster, shell, sidebar, вкладки, design system | 🚧 в работе |
| 4. Kubernetes UX | Resource Browser, таблицы, поиск/фильтры, Details, YAML, Events, Logs, Terminal, Exec, CRD Discovery | 🚧 в работе |
| 5. Дополнительно | Topology, Diagnostics, Timeline, Helm, GitOps, Metrics, Audit | ⏳ не начат |

Нереализованная функциональность явно помечается в UI (EmptyState с пояснением), а не имитируется.

---

## 13. Критерии качества (контракт)

1. Никаких фиктивных страниц и кнопок без функциональности.
2. Никаких mock-данных в готовых функциях — только реальная K8s-интеграция.
3. Никакого Go, отдельного бэкенда, Docker.
4. Shell/навигация/вкладки — только Freelens-механика; таблицы/детали — только Radar-стиль.
5. Компоненты небольшие и композиционные; логика Electron и React не смешивается.
6. Все привилегированные операции — в main; renderer — только через типизированный IPC.
7. Атрибуция Radar (Apache-2.0) — в `THIRD_PARTY_NOTICES.md`.
