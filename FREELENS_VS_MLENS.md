# Freelens → mLens: что есть, чего нет

Сравнение фич **Freelens** и **mLens 0.1.0** (этот репозиторий).

Источник Freelens: `/Users/levins/Projects/Freelens`, форк `xpapirusx/freelens`
(upstream `freelensapp/freelens`), ветка `main`, коммит `46049242`, пакет
`@freelensapp/core 2.0.1-0`, лицензия MIT. Это Freelens 2.x: архитектура
переработана относительно Lens 6 (`business-features`, `technical-features`,
`cluster-sidebar`, `list-layout`, YAML-темы, extension API v2). Electron
44.10.1, в комплекте kubectl 1.37.2, Helm 4.3.1, `freelens-k8s-proxy` 2.0.0.

Проверялось по коду Freelens и по докам/коду mLens. Обозначения:
✅ есть · 🟡 частично · ❌ нет · — не применимо.
Пометка **(в работе)** — есть только в незакоммиченных изменениях mLens
(`git status`), в `HEAD` этого нет.

---

## TL;DR

mLens строился **по оболочке Freelens**, поэтому базовые механики совпадают:
одно окно, hotbar, каталог кластеров, sidebar с группами, sibling-вкладки,
drawer деталей, нижний dock, namespace-фильтр, CRD, YAML, Helm-механик нет.

**Freelens всё ещё впереди в:**

- **расширениях** (extension API v2, установка по имени/URL/файлу/каталогу,
  enable/disable, страницы и слоты UI, custom resources, шифрованные
  креденшелы; маркетплейса при этом нет);
- **Helm** (charts + releases, install/upgrade/rollback/history/values/
  repositories, server-side);
- **метриках** (Prometheus-провайдеры, графики кластера/подов/нод/workload,
  time range, pie charts, HPA/Ingress/PVC-графики);
- **node/pod-инструментах** (node shell через pod, pod attach, node menu,
  drain, cordon);
- **cluster settings** (proxy, образы node shell, image pull secret,
  accessible namespaces, скрытие метрик, Prometheus);
- **кастомизации** (YAML-темы с импортом/экспортом, accent color, Monaco и
  terminal-токены, настройки редактора/терминала/прокси);
- **cluster overview**, **workloads overview**, **combined pod logs**,
  **resource templates**, **RBAC-скрытии недоступного**.

**mLens впереди в:**

- вкладках кластеров и **вкладках открытых ресурсов** (у Freelens их нет);
- **вкладках внутри drawer** (у Freelens один скролл секций);
- **плотности Radar** и визуальном языке;
- **regex-поиске** и фильтре Problems;
- **HPA-guard** при ручном scale;
- **Pause/Resume rollout** для Deployment;
- **неразрушающем каталоге** кластеров (remove + restore);
- **порядке колонок** и **настраиваемой высоте строк**;
- **Dracula**-теме;
- **dry-run** перед apply;
- **явном статус-баре** с данными;
- отсутствии зависимости от kubectl/helm-бинарей и extension runtime.

---

## 1. Оболочка, кластеры, каталог

| Фича | Freelens | mLens | Комментарий |
|---|---|---|---|
| Одно окно приложения | ✅ | ✅ | обе Electron |
| Мультиокно | ❌ | ❌ | |
| Single-instance + deep links | ✅ `freelens://` | ❌ | |
| Splash screen | ✅ | 🟡 loading screen | |
| Hotbar | ✅ 12 ячеек, несколько hotbar, drag, auto-hide | ✅ 10 слотов, drag | |
| Каталог сущностей/кластеров | ✅ категории, вкладки, поиск, entity drawer, web links | 🟡 каталог кластеров | |
| Add cluster: kubeconfig / sync / web link | ✅ | 🟡 kubeconfig + paste | |
| Kubeconfig sync (files/folders, watcher) | ✅ | 🟡 статические sources | |
| Вкладки открытых кластеров | ❌ | ✅ | mLens добавил сверх Freelens |
| Cluster frames (скрытые, не размонтируются) | ✅ | ✅ CSS-hidden workspaces | |
| Удаление кластера | ✅ (правит kubeconfig!) | ✅ только из каталога, с restore | mLens безопаснее |
| Favourites / pinned | ✅ pinned sidebar items, short names | ✅ pinned kinds + favourites | |
| Переключение кластера | ✅ hotbar | ✅ hotbar + вкладки + каталог | |
| Top bar: home/back/forward | ✅ | 🟡 forward disabled | |
| Command palette | ✅ `⌘⇧P` | ✅ `⌘K` | |
| Status bar | 🟡 только extension-items | ✅ встроенный | |
| Notifications / toasts | ✅ | ✅ | |
| Tray icon | ✅ show/hide, open, prefs, quit | ❌ | |
| Меню приложения | ✅ File/Edit/View/Help | ✅ native menu | |
| Проверка новой версии | ✅ welcome toast | ❌ | |
| Авто-обновление | ❌ | ❌ | у Freelens явно отключено |
| Kubeconfig dialog (просмотр/скачивание) | ✅ | 🟡 copy context | |
| Cluster settings (per-cluster) | ✅ §14 | 🟡 глобальные настройки | |

---

## 2. Sidebar и навигация

Порядок Freelens (`sidebar-menu-items-starting-order.ts`): **Favorites, Cluster
Overview, Nodes, Workloads, Config, Network, Storage, Namespaces, Events, Helm,
User Management, Custom Resources**.

| Фича | Freelens | mLens | Комментарий |
|---|---|---|---|
| Группы в порядке Lens | ✅ | ✅ | mLens убрал Helm/Overview (их нет) |
| Cluster Overview (отдельный экран) | ✅ | 🟡 (в работе) | `features/overview/ClusterOverview.tsx` |
| Favorites (pinned items, short names, reorder) | ✅ | ✅ pinned kinds | |
| Кастомизация порядка меню | ✅ drag + Preferences | 🟡 drag групп | |
| Сброс порядка меню | ✅ | ❌ | |
| Скрытие items (hidden-in-tree) | ✅ | ❌ | |
| Sidebar search | ✅ | ✅ | |
| Счётчики ресурсов | ✅ | ✅ (+ «≥») | |
| Иконка кластера: файл + цвет | ✅ | 🟡 инициалы | |
| Namespace filter (multi-select, key) | ✅ | ✅ | |
| Namespace details + add/delete | ✅ + HNC subnamespace | 🟡 list only | |
| Sibling resource tabs | ✅ | ✅ | |
| RBAC-скрытие недоступных items | ✅ SSRR/SSAR | ❌ | заметная разница |
| User management (SA/Roles/Bindings) | ✅ | ✅ | |
| Custom Resources (CRD + группы) | ✅ | ✅ | |
| Helm item | ✅ | ❌ | |

---

## 3. Списки ресурсов

| Фича | Freelens | mLens | Комментарий |
|---|---|---|---|
| Все встроенные виды | ✅ | ✅ | |
| CRD и custom resources | ✅ | ✅ | |
| Printer columns CRD | ✅ | ✅ | |
| Smart-колонки по kind | ✅ | ✅ | |
| Сортировка + URL-sync | ✅ | ✅ | |
| Resize колонок | ✅ | ✅ | |
| Скрытие колонок | ✅ | ✅ | |
| **Порядок колонок** | ❌ | ✅ | |
| **Pin колонок** | ❌ | ❌ | |
| Кастомные колонки из label/annotation | ❌ | ❌ | нет ни там, ни там |
| Поиск | ✅ plain, separator-insensitive | ✅ + regex | |
| Фильтры (chips, reset) | ✅ | ✅ per-column include | |
| Problems-фильтр | ❌ | ✅ | |
| Namespace scope all/one/several | ✅ | ✅ | |
| Чекбоксы выбора строк | ✅ всегда видимы | ✅ | |
| **Bulk-удаление выбранных** | ✅ `Remove selected (n)` | ✅ + bulk bar | |
| Virtualized/большие списки | ✅ | ✅ | |
| Метрики в таблице (CPU/Mem) | ✅ Prometheus + metrics-server | ✅ metrics-server | |
| Метрики: CPU/Mem/Disk/Pods для Nodes | ✅ | ✅ | |
| Индикатор ошибок загрузки | ✅ warning icon + tooltip | 🟡 inline error | |
| Индикатор свежести | 🟡 | ✅ | |
| Create resource | ✅ dock + шаблоны | ✅ YAML dialog | |
| **Resource templates** | ✅ 22 + пользовательские (hot reload) | ❌ | заметная фича Freelens |
| Формы создания (Namespace/Secret/Quota/RBAC) | ✅ | ❌ | mLens только YAML |
| Copy name / delete / edit YAML | ✅ | ✅ | |

---

## 4. Детали ресурса

| Фича | Freelens | mLens | Комментарий |
|---|---|---|---|
| Правый drawer | ✅ 300px–90%, scroll restore | ✅ | |
| Full-page detail | ❌ | ❌ | |
| Вкладки деталей | ❌ один скролл секций | ✅ 7 вкладок | |
| Kind-специфичные renderer'ы | ✅ много | ✅ много | |
| Metadata: finalizers, last-applied, managed fields | ✅ | 🟡 raw spec | |
| Related resources | ❌ (только ссылки в meta) | 🟡 (в работе) | |
| Events по объекту | ❌ (только общий Events) | ✅ | |
| Conditions | ✅ | ✅ | |
| YAML просмотр/редактирование | ✅ в dock, JSON-patch diff | ✅ Monaco + dry-run/apply | |
| **YAML diff + Sort/Managed Fields toggles** | ✅ | ❌ | |
| **Server-side dry-run перед apply** | ❌ | ✅ | mLens безопаснее |
| Secret: просмотр значений | ✅ inline show/hide | ✅ reveal | |
| Secret: редактирование key/value | ✅ | ✅ | |
| Certificate details (TLS Secret) | ✅ CN/issuer/SAN/validity | ❌ | |
| ConfigMap: редактирование value | ✅ Monaco per key | ✅ key/value | |
| Env vars и ссылки на Secret/ConfigMap | ✅ + reveal | ✅ + inline peek | |
| Resource metrics (графики) | ✅ Prometheus | 🟡 metrics-server values | |
| HPA charts (current/target) | ✅ | ❌ | |
| Copy name | ✅ | ✅ | |
| Delete с подтверждением | ✅ | ✅ | |
| Force delete / Force finalize | ✅ Pod + finalizers | 🟡 force delete (в работе) | |
| Drawer: copy name, per-history scroll | ✅ | 🟡 | |

---

## 5. Действия над workload

| Действие | Freelens | mLens | Комментарий |
|---|---|---|---|
| Scale | ✅ Deployment/StatefulSet/ReplicaSet | ✅ + HPA-guard | mLens блокирует при HPA |
| Restart | ✅ Deployment/StatefulSet/DaemonSet | ✅ | |
| Pause/Resume rollout | ❌ | ✅ | преимущество mLens |
| Suspend/Resume Job | ✅ | ✅ | |
| Suspend/Resume CronJob | ✅ | ✅ | |
| **CronJob Trigger** | ✅ создаёт Job из jobTemplate | ✅ (в работе) | |
| Set image | ❌ | ✅ (в работе) | |
| Revision history + rollback (workload) | ❌ | ❌ | |
| Cordon/uncordon | ✅ node menu | 🟡 (в работе) | |
| Drain | ✅ через kubectl в терминале | ✅ (в работе) | |
| Node shell | ✅ privileged pod + nsenter | ❌ | |
| Pod shell | ✅ kubectl exec | ✅ exec WebSocket | |
| Pod attach | ✅ kubectl attach | 🟡 backend attach (в работе) | |
| Debug/ephemeral container | ❌ | ❌ | |
| Delete pod / evict | ✅ delete | ✅ delete | |
| HPA-guard при scale | ❌ | ✅ | преимущество mLens |

---

## 6. Логи, терминал, dock

| Фича | Freelens | mLens | Комментарий |
|---|---|---|---|
| Pod logs в dock | ✅ | ❌ (в drawer) | |
| Container selector (вкл. init) | ✅ + default marker | ✅ (без init) | |
| Переключение между подами workload | ✅ pod switcher | ❌ | |
| Previous container | ✅ | ✅ | |
| Timestamps | ✅ | ✅ | |
| Word wrap | ✅ | ❌ | |
| Поиск по логам | ✅ + selected text | ✅ | |
| Download logs | ✅ visible/all, лимиты | 🟡 текущий лог | |
| **Combined logs (несколько подов)** | ✅ ANSI `[pod]`, лимит 1–100 | ❌ | |
| Workload logs | ✅ | ❌ | |
| Structured/level-фильтры | ❌ | ❌ | |
| Локальный терминал (PTY) | ✅ | ✅ | |
| Context-pinned kubeconfig | ✅ через proxy | ✅ 0600 kubeconfig | |
| Несколько вкладок терминала | ✅ | ✅ | |
| **Standalone terminal вне кластера** | ✅ отдельная страница | ❌ (только в кластере) | |
| Терминал: shell path | ✅ | 🟡 `$SHELL` | |
| Терминал: font family/size/theme | ✅ + 9 Nerd-шрифтов | 🟡 DM Mono, размер | |
| Terminal copy-on-select / paste-on-right-click | ✅ | 🟡 | |
| Restart session | ✅ | ❌ | |
| Dock tabs (logs/terminal/create/edit) | ✅ | 🟡 только терминалы | |
| Fullscreen dock | ✅ | ✅ | |
| Dock shortcuts | ✅ `Shift+Esc`, `Ctrl+.` | 🟡 | |

---

## 7. Port forwarding

| Фича | Freelens | mLens | Комментарий |
|---|---|---|---|
| Port-forward из Pod | ✅ | ✅ | |
| Port-forward из Service | ✅ per port | ❌ | |
| Port-forward из Deployment | ✅ | ❌ | |
| Диалог: listen address, local port, HTTPS | ✅ | 🟡 local port | |
| Страница активных port-forward | ✅ Name/NS/Kind/порты/status | ✅ панель | |
| Start/stop/edit/open/remove | ✅ | 🟡 stop | |
| Сохранение форвардов после рестарта | ✅ | ❌ | |
| UDP | ❌ | ❌ | |
| Реализация | kubectl subprocess | Kubernetes WebSocket | архитектурная разница |

---

## 8. Helm

| Фича | Freelens | mLens |
|---|---|---|
| Список релизов | ✅ | ❌ |
| Install chart (wizard) | ✅ | ❌ |
| Upgrade chart | ✅ | ❌ |
| Values editor + save | ✅ | ❌ |
| History ревизий | ✅ | ❌ |
| Rollback | ✅ | ❌ |
| Delete release (с предупреждением о PVC) | ✅ | ❌ |
| Charts list + details | ✅ | ❌ |
| Repositories (ArtifactHub, custom, TLS/auth) | ✅ | ❌ |
| Server-side apply | ✅ | ❌ |
| Helm binary path / bundled | ✅ | ❌ (и не нужен) |

---

## 9. Metrics

| Фича | Freelens | mLens | Комментарий |
|---|---|---|---|
| Prometheus как источник | ✅ 7 провайдеров | ❌ | |
| Prometheus config (address/TLS/path/token/method/mounts) | ✅ | ❌ | |
| metrics-server fallback | ✅ | ✅ | |
| Cluster metrics + switchers (control-plane/worker, CPU/Mem) | ✅ | ❌ | |
| Pie charts (CPU/Mem/Pods) | ✅ | ❌ | |
| Time range (5m–24h + custom) | ✅ | ❌ | |
| Node/pod/container/workload/namespace metrics | ✅ | 🟡 live pod/node | |
| Ingress/PVC/HPA charts | ✅ | ❌ | |
| Metrics в таблицах | ✅ | ✅ CPU/Mem | |
| Hidden metrics per resource type | ✅ | ❌ | |
| No-metrics UX | ✅ «not available» + link | ✅ «–» | |
| History / тренды | ✅ Prometheus | ❌ | |

---

## 10. Nodes и Pods

| Фича | Freelens | mLens |
|---|---|---|
| Node detail (capacity, conditions, taints, pods) | ✅ | ✅ |
| Node metrics (CPU/Mem/Disk/Pods charts) | ✅ | 🟡 live |
| Node shell | ✅ | ❌ |
| Node cordon/drain | ✅ | 🟡 cordon (в работе) |
| Список подов на ноде + CPU/Mem | ✅ | 🟡 фильтр по Node |
| Pod detail (containers, env, volumes, conditions) | ✅ | ✅ |
| Pod metrics (CPU/Mem/Network/FS charts) | ✅ | 🟡 live values |
| Pod shell / attach | ✅ / ✅ | ✅ / 🟡 (в работе) |
| Pod logs | ✅ (dock) | ✅ (drawer) |
| Pod files / image FS | ❌ | ❌ |
| Workload overview (statuses, events, metrics) | ✅ | 🟡 details only |
| Cluster issues (nodes + warning events) | ✅ | ❌ |

---

## 11. Config, Network, Storage, RBAC

| Фича | Freelens | mLens | Комментарий |
|---|---|---|---|
| ConfigMaps | ✅ | ✅ | |
| Secrets | ✅ | ✅ | |
| HPA / VPA | ✅ | ✅ | |
| PDB | ✅ | ✅ | |
| Priority/Runtime classes | ✅ | ✅ | |
| LimitRanges / ResourceQuotas | ✅ | ✅ | |
| Leases | ✅ | ✅ | |
| Webhooks (mutating/validating) | ✅ | ✅ | |
| Admission policies | ✅ | ✅ | |
| Services / Ingress / Endpoints / EndpointSlices | ✅ | ✅ | |
| Ingress class «Set as default» | ✅ | ❌ | |
| NetworkPolicies | ✅ | ✅ | |
| PortForwards page | ✅ | 🟡 панель | |
| PV / PVC / StorageClasses | ✅ | ✅ | |
| ServiceAccounts / Roles / Bindings | ✅ | ✅ | |
| **ServiceAccount kubeconfig (copy/download)** | ✅ | ❌ | |
| **Role binding subject editor** | ✅ | ❌ | mLens только YAML |
| PodSecurityPolicies | ✅ | ✅ generic | |
| Effective permissions / SSAR | ✅ (скрытие) | ❌ | |
| Accessible namespaces allow-list | ✅ | ❌ | |
| Skip namespace authorization check | ✅ | ❌ | |
| HNC subnamespace awareness | ✅ | ❌ | |

---

## 12. Расширения

| Фича | Freelens | mLens |
|---|---|---|
| Extension API v2 | ✅ | ❌ |
| Install по имени/версии из npm-registry | ✅ | ❌ |
| Install по URL (tar.gz + sha256) | ✅ | ❌ |
| Install из файла / каталога / drag-drop | ✅ | ❌ |
| Enable/disable/uninstall | ✅ | ❌ |
| Проверка checksum/provenance | ✅ | ❌ |
| Versioned storage + sweep | ✅ | ❌ |
| Compatibility check `engines.freelens` | ✅ | ❌ |
| Extension settings pages | ✅ | ❌ |
| Extension pages/routes, top-bar/status-bar slots | ✅ | ❌ |
| Extension details/menu items в объектах | ✅ | ❌ |
| Custom resources, презентуемые расширением | ✅ | ❌ |
| Extension credentials (OS secret store) | ✅ | ❌ |
| Extension binaries + host shell | ✅ | ❌ |
| Protocol handlers `freelens://extension/...` | ✅ | ❌ |
| Маркетплейс/поиск расширений | ❌ | ❌ |
| Обновление расширений | ❌ | ❌ |
| v1-расширения | ❌ несовместимы | — |

Это самая большая функциональная разница: mLens принципиально без
extension-системы (`DESIGN_SPEC.md` §5).

---

## 13. Темы, настройки, клавиатура

| Фича | Freelens | mLens | Комментарий |
|---|---|---|---|
| Light/dark/system | ✅ | ✅ | |
| **YAML-темы: импорт/экспорт/remove** | ✅ | ❌ | |
| Тёмный и светлый вариант в одной теме | ✅ | 🟡 фиксированные пары | |
| Live-watch файлов тем | ✅ | ❌ | |
| Accent color (10 пресетов + custom, WCAG AA) | ✅ | ❌ | |
| Monaco-токены в теме | ✅ | 🟡 встроенные темы | |
| Terminal ANSI-цвета в теме | ✅ | ✅ фиксированные | |
| Терминал «Match Freelens theme» | ✅ | 🟡 фиксированная палитра | |
| Встроенных тем | 1 (`freelens`) | 3 (Radar, Dracula, Freelens) | у mLens больше из коробки |
| Редактор: font, size, tab size, minimap, line numbers | ✅ | 🟡 Monaco fixed | |
| Терминал: shell path, font family/size, theme, copy/paste | ✅ | 🟡 размер/шрифт | |
| App prefs: autostart, tray, hotbar auto-hide, sidebar reset, timezone, registry | ✅ | ❌ | |
| Kubernetes prefs: kubeconfig sync, kubectl binary/download/mirror, helm path/server-side, combined logs | ✅ | 🟡 sources | |
| Proxy prefs: HTTP proxy, allow untrusted CAs | ✅ | ❌ | |
| Extension preferences tab | ✅ | ❌ | |
| Keyboard shortcuts | ✅ реестр | ✅ локальные + `G`-переходы (в работе) | |
| Ремаппинг клавиш | ❌ | ❌ | |
| Справка по шорткатам | ❌ | ✅ (в работе: `?`) | |
| Command palette | ✅ | ✅ | |

Клавиши Freelens: `⌘⇧P` палитра, `⌘⇧C` каталог, `⌘⇧A` add cluster, `⌘,`
preferences, `⌘F` поиск/логи, `Esc`, `Shift+Esc` dock, `⌘W` закрыть dock-tab,
`Ctrl+.`/`Ctrl+,` вкладки dock, `⌘⇧E` extensions.

---

## 14. Cluster settings (per-cluster)

| Настройка | Freelens | mLens |
|---|---|---|
| Имя кластера | ✅ | ❌ |
| Иконка (файл) и цвет | ✅ | 🟡 инициалы |
| Kubeconfig (просмотр/скачивание) | ✅ | 🟡 copy context |
| Accessible namespaces (allow-list) | ✅ | ❌ |
| Local terminal: working dir, default namespace | ✅ | 🟡 selected namespace |
| Metrics: скрыть по типам / сбросить | ✅ | ❌ |
| Prometheus: address, HTTPS, path, token, method, mountpoints | ✅ | ❌ |
| Node shell image (Linux/Windows) + image pull secret | ✅ | ❌ |
| Proxy (per-cluster) | ✅ | ❌ |
| Skip namespace authorization check | ✅ | ❌ |

---

## 15. Дистрибуция и безопасность

| Фича | Freelens | mLens |
|---|---|---|
| macOS DMG + PKG (arm64/amd64), notarization | ✅ | ✅ DMG/zip (unsigned) |
| Windows NSIS + MSI + Portable | ✅ | ✅ NSIS (не собран) |
| Linux deb/rpm/AppImage | ✅ | ✅ deb/AppImage (не собран) |
| Flatpak / Snap / AUR / APT repo | ✅ | ❌ |
| Homebrew / WinGet / Scoop | ✅ | ❌ |
| Bundled kubectl + helm + k8s-proxy | ✅ | ❌ (и не нужен) |
| Kubectl version-matched download | ✅ | — |
| Auto-update | ❌ | ❌ |
| SBOM + Grype scan релизов | ✅ | ❌ |
| Secret store для extension credentials | ✅ | — |
| Sandboxed renderer | ✅ | ✅ |
| Kubeconfig не изменяется | 🟡 (delete правит) | ✅ |
| Telemetry | ❌ | ❌ |

---

## 16. Чего у Freelens нет, а у mLens есть

1. **Вкладки открытых кластеров** — у Freelens только hotbar.
2. **Вкладки открытых ресурсов** с back stack — Freelens открывает один drawer.
3. **Вкладки внутри drawer** (Overview/Details/YAML/Events/Related/Logs/
   Metrics) — у Freelens один скролл секций, логи/YAML уходят в dock.
4. **Regex-поиск** и **Problems-фильтр**.
5. **Порядок колонок** (Freelens: только resize/скрытие).
6. **HPA-guard** при ручном scale.
7. **Pause/Resume rollout** для Deployment.
8. **Неразрушающее удаление кластера** из каталога + restore (Freelens правит
   kubeconfig).
9. **Dracula**-тема из коробки (Freelens: 1 тема + импорт YAML).
10. **Плотность Radar**: 44px строки, 12px uppercase заголовки, компактные
    бейджи, настраиваемая высота строк 24–52px.
11. **Server-side dry-run** перед apply и YAML-apply без kubectl.
12. **Per-kind глобальные ширины колонок**, общие для всех кластеров.
13. **Статус-бар с данными** (у Freelens он только для extension-items).
14. **Отсутствие зависимости от kubectl/helm-бинарей** и extension runtime.
15. **Set image** для workload (у Freelens нет).
16. **Глобальный поиск ресурсов в палитре** и оверлей `?`.

---

## 17. Приоритеты для mLens

Freelens — родитель оболочки, поэтому догонять имеет смысл только там, где это
усиливает продукт, а не копирует конкурента.

### P0 — дешёвые и заметные

1. **Resource templates** в Create YAML (22 готовых + свои) — почти бесплатно.
2. **Combined/workload logs** в dock + переключение между подами.
3. **Download всех логов** пода/workload (сейчас только текущий буфер).
4. **Port-forward из Service и Deployment** + сохранение форвардов после
   рестарта.
5. **Node shell** и **pod attach** (attach-режим уже начат в main).
6. **Certificate details** для TLS Secret (x509 в Node).
7. **Формы создания** Namespace/Secret/ResourceQuota/Role/Binding.
8. **ServiceAccount kubeconfig** (copy/download).
9. **Terminal shell path**, набор шрифтов, standalone terminal.
10. **Ingress class «Set as default»**.

### P1 — крупные, но ожидаемые

11. **Helm** (releases + charts + repos + rollback) — главный пробел.
12. **Prometheus-источник** + графики/time range (кластер, node, pod,
    workload, HPA, PVC, Ingress) — расширяет live-метрики.
13. **Cluster Overview** — довести начатый экран до pie charts/time range/
    issues.
14. **Workloads overview** — отдельная страница статусов.
15. **Cluster settings UI** (per-cluster): имя, иконка, proxy, node shell
    image, image pull secret.
16. **RBAC-скрытие недоступных items** через SelfSubjectRulesReview.
17. **YAML diff/JSON-patch** при редактировании (dry-run уже есть).
18. **Metrics hidden per type** и no-metrics UX.

### P2 — стратегические

19. **Extensions API** — самое дорогое и спорное: mLens явно позиционируется
    без extension-системы. Решать осознанно.
20. **YAML-темы** (импорт/экспорт, accent, Monaco/terminal tokens) поверх
    текущих CSS-токенов.
21. **Kubeconfig sync** из каталогов (сейчас статические sources).
22. **Deep links** (`freelens://`-аналог) и проверка версии.
23. **Flatpak/Snap/Homebrew** для дистрибуции.
24. **i18n** (у Freelens её тоже нет).

---

## 18. Замечания

1. **Hotbar 75px vs 54px** — не ошибка документации: Freelens 2 использует
   `--hotbar-width: 75px` (`cluster-manager.scss`), а mLens сознательно ужал
   рельс до 54px под плотность Radar. Это осознанное отличие.
2. **Freelens 2.x ≠ Lens 6**, на который ориентировались документы mLens:
   другие пакеты, YAML-темы, extension API v2, catalog sources, combined logs,
   RBAC-скрытие. При сверке «как в Freelens» смотреть именно эту ветку.
3. **Extension-система** — единственная фича, которую mLens сознательно не
   копирует (`DESIGN_SPEC.md` §5). Это продукт-решение, а не забытый долг.
   Маркетплейса расширений у Freelens при этом тоже нет — только установка по
   имени/URL/файлу/каталогу.
4. **Архитектурная разница**: Freelens выполняет apply, exec и port-forward
   через **встроенные бинари kubectl/helm**, mLens — напрямую через Kubernetes
   API/WebSocket. Поэтому часть фич Freelens (drain, node shell, kubectl-команды)
   у mLens требует отдельной реализации, а не переиспользования бинаря.
5. **Helm и метрики** — два самых заметных пользовательских пробела; оба
   реализуемы без бинарей и без Go.
6. **Удаление кластера в Freelens** может переписать kubeconfig пользователя;
   в mLens удаление из каталога неразрушающее — это осознанное преимущество,
   которое стоит сохранять.
