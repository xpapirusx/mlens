# Freelens → mLens: что есть, чего нет

Сравнение фич **Freelens** и **mLens 0.1.0** (этот репозиторий).

Источник Freelens: `/Users/levins/Projects/Freelens`, форк `xpapirusx/freelens`
(upstream `freelensapp/freelens`), ветка `main`, коммит `46049242`, пакет
`@freelensapp/core 2.0.1-0`, лицензия MIT. Это Freelens 2.x — архитектура
сильно переработана относительно Lens 6 (пакеты `business-features`,
`technical-features`, `cluster-sidebar`, `list-layout`, YAML-темы, extension
API v2).

Проверялось по коду Freelens и по докам/коду mLens. Обозначения:
✅ есть · 🟡 частично · ❌ нет · — не применимо.
Пометка **(в работе)** — есть только в незакоммиченных изменениях mLens
(`git status`), в `HEAD` этого нет.

---

## TL;DR

mLens строился **по оболочке Freelens**, поэтому базовые механики уже совпадают:
одно окно, hotbar, каталог кластеров, sidebar с группами, drawer деталей,
нижний dock, namespace-фильтр, CRD, YAML, Helm-подобных механик нет.

**Freelens всё ещё впереди в:**

- **расширениях** (extension API v2, каталог, установка/включение, страницы,
  custom resource extensions, шифрование креденшелов);
- **Helm** (charts + releases, install/upgrade/rollback/history/values/
  repositories, server-side);
- **метриках** (Prometheus-источник, графики кластера/подов/нод/workload,
  time range, pie charts);
- **node/pod-инструментах** (node shell, pod attach, node menu, drain);
- **cluster settings** (proxy, образы node shell, image pull secret,
  accessible namespaces, скрытие метрик, Prometheus);
- **кастомизации** (YAML-темы с импортом/экспортом, accent color, Monaco и
  terminal-токены, настройки редактора/терминала/прокси/времени);
- **cluster overview** и **combined pod logs**.

**mLens впереди в:**

- вкладках кластеров и **вкладках открытых ресурсов** (у Freelens их нет);
- **плотности Radar** и визуальном языке;
- **bulk-выделении/удалении**, regex-поиске, фильтре Problems;
- **редакторе ConfigMap/Secret** (key/value, base64);
- **HPA-guard** при scale;
- **каталоге кластеров** с неразрушающим удалением и restore;
- **per-kind порядке/ширинах колонок** и настраиваемой высоте строк;
- **Dracula**-теме;
- **force delete** и явном статус-баре.

---

## 1. Оболочка, кластеры, каталог

| Фича | Freelens | mLens | Комментарий |
|---|---|---|---|
| Одно окно приложения | ✅ | ✅ | обе Electron |
| Мультиокно | ❌ | ❌ | |
| Hotbar (10 слотов, drag) | ✅ `hotbar/*` | ✅ | |
| Welcome / список кластеров + hotbar | ✅ `welcome`, `cluster-manager` | ✅ каталог | |
| Extension catalog (маркетплейс) | ✅ `renderer/components/catalog` | ❌ | см. §12 |
| Вкладки открытых кластеров | ❌ | ✅ | mLens добавил сверх Freelens |
| Cluster frames (скрытые, не размонтируются) | ✅ `common/cluster-frames` | ✅ CSS-hidden workspaces | |
| Добавление кластера из kubeconfig | ✅ | ✅ | |
| Вставка kubeconfig как YAML | ✅ | ✅ | |
| Kubeconfig sync (авто-подхват из файлов/каталогов) | ✅ `main/catalog-sources/kubeconfig-sync` | 🟡 только чтение sources | |
| Удаление кластера | ✅ (из внутреннего kubeconfig) | ✅ только из каталога, с restore | |
| Favourites / pinned | ✅ pinned sidebar items | ✅ pinned kinds + favourites | |
| Переключение кластера | ✅ hotbar | ✅ hotbar + вкладки + каталог | |
| Command palette | ✅ | ✅ (меньше команд) | |
| Status bar | ✅ | ✅ | |
| Notifications / toasts | ✅ `@freelensapp/notifications` | ✅ toast | |
| Tray icon / меню приложения | ✅ | 🟡 native menu | |
| Deep links (`freelens://`) | ✅ protocol handler | ❌ | |
| Проверка новой версии | ✅ welcome notification | ❌ |
| Авто-обновление | ❌ | ❌ | |
| Kubeconfig dialog (просмотр/скачивание) | ✅ cluster settings | 🟡 copy context | |
| Cluster settings (per-cluster) | ✅ см. §14 | 🟡 только namespace/terminal | |

---

## 2. Sidebar и навигация

Порядок Freelens (`sidebar-menu-items-starting-order.ts`): **Favorites, Cluster
Overview, Nodes, Workloads, Config, Network, Storage, Namespaces, Events, Helm,
User Management, Custom Resources**.

| Фича | Freelens | mLens | Комментарий |
|---|---|---|---|
| Группы в порядке Lens | ✅ | ✅ | mLens убрал Helm/Overview (их нет) |
| Cluster Overview (отдельный экран) | ✅ | 🟡 (в работе) | `features/overview/ClusterOverview.tsx` |
| Favorites (pinned sidebar items, short names, overview) | ✅ | ✅ pinned kinds | |
| Кастомизация порядка меню | ✅ Preferences → Sidebar menu | 🟡 drag групп | |
| Скрытие items | ✅ | ❌ | |
| Sidebar search | ✅ | ✅ | |
| Счётчики ресурсов | ✅ | ✅ (+ «≥») | |
| Красивый логотип/иконка кластера (цвет/файл) | ✅ cluster settings | ❌ | |
| Namespace filter (multi-select, key) | ✅ | ✅ | |
| Namespace details + add/delete | ✅ | 🟡 list only | |
| User management (SA/Roles/Bindings) | ✅ | ✅ | |
| Custom Resources (CRD + instances) | ✅ | ✅ | |
| Helm item | ✅ | ❌ | |

---

## 3. Списки ресурсов

| Фича | Freelens | mLens | Комментарий |
|---|---|---|---|
| Все встроенные виды | ✅ | ✅ | |
| CRD и custom resources | ✅ | ✅ | |
| Printer columns CRD | ✅ | ✅ | |
| Smart-колонки по kind | ✅ | ✅ | |
| Сортировка | ✅ | ✅ | |
| Resize колонок | ✅ | ✅ | |
| Скрытие колонок | ✅ | ✅ | |
| **Порядок колонок** | ❌ | ✅ | |
| **Pin колонок** | ❌ | ❌ | |
| Кастомные колонки из label/annotation | ❌ | ❌ | нет ни там, ни там |
| Поиск | ✅ plain | ✅ + regex | |
| Фильтры по колонкам | 🟡 статус/namespace | ✅ per-column include | |
| Problems-фильтр | ❌ | ✅ | |
| Namespace scope all/one/several | ✅ | ✅ | |
| Bulk-выделение и bulk-удаление | ❌ | ✅ | |
| Virtualized/большие списки | ✅ `virtual-list` | ✅ | |
| Метрики в таблице (CPU/Mem) | ✅ Prometheus | ✅ metrics-server | разные источники |
| Resource usage bars | ✅ | ✅ | |
| Обновление списка | ✅ watch + poll | ✅ watch + poll | |
| Индикатор свежести | 🟡 | ✅ | |
| Create resource | ✅ dock + шаблоны | ✅ YAML dialog | |
| **Resource templates** | ✅ 22 шаблона + пользовательские | ❌ | заметная фича Freelens |
| Copy name / delete / edit YAML | ✅ | ✅ | |

---

## 4. Детали ресурса

| Фича | Freelens | mLens | Комментарий |
|---|---|---|---|
| Правый drawer | ✅ | ✅ | |
| Full-page detail | ❌ | ❌ | |
| Вкладки деталей | ❌ секции в drawer; логи/YAML — в dock | ✅ 7 вкладок | |
| Kind-специфичные renderer'ы | ✅ много | ✅ много | |
| Related resources | 🟡 ссылки в деталях | 🟡 (в работе) | |
| Events по объекту | ✅ | ✅ | |
| YAML просмотр/редактирование | ✅ Monaco + apply | ✅ Monaco + dry-run/apply | |
| Secret: просмотр значений | ✅ (decode) | ✅ reveal | |
| Secret: редактирование key/value | ✅ | ✅ | |
| Certificate details (TLS Secret) | ✅ `secret-certificates` | ❌ | |
| Env vars и ссылки на Secret/ConfigMap | ✅ | ✅ + inline peek | |
| Resource metrics (графики) | ✅ Prometheus | 🟡 metrics-server values | |
| Conditions / probes / affinity | ✅ | ✅ | |
| Copy kubectl command | ✅ | ✅ | |
| Delete с подтверждением | ✅ | ✅ | |
| Force delete | ❌ | ✅ (в работе) | |

---

## 5. Действия над workload

| Действие | Freelens | mLens | Комментарий |
|---|---|---|---|
| Scale | ✅ Deployment/StatefulSet | ✅ + HPA-guard | |
| Restart | ✅ Deployment/StatefulSet/DaemonSet | ✅ | |
| Pause/Resume rollout | ❌ | ✅ | преимущество mLens |
| Suspend/Resume Job/CronJob | ✅ | ✅ | |
| Set image | ❌ | ❌ | |
| Revision history + rollback | ❌ | ❌ | |
| CronJob trigger | ❌ | ❌ | |
| Cordon/uncordon | ✅ node menu | 🟡 (в работе) | |
| Drain | ✅ node menu | ❌ | |
| Node shell | ✅ | ❌ | |
| Pod shell | ✅ | ✅ (exec) | |
| Pod attach | ✅ | 🟡 backend attach (в работе) | |
| Debug/ephemeral container | ❌ | ❌ | |
| Delete pod / evict | ✅ | ✅ delete | |

---

## 6. Логи, терминал, dock

| Фича | Freelens | mLens | Комментарий |
|---|---|---|---|
| Pod logs в dock | ✅ | ❌ (только drawer) | |
| Контейнер-selector | ✅ | ✅ | |
| Previous container | ✅ | ✅ | |
| Timestamps | ✅ | ✅ | |
| Word wrap | ✅ | ❌ | |
| Поиск по логам | ✅ | ✅ | |
| Download logs (pod/workload, all) | ✅ | 🟡 текущий лог | |
| **Combined logs (несколько подов в одной вкладке)** | ✅ + лимит подов в preferences | ❌ | |
| Workload logs | ✅ | ❌ | |
| Structured/level-фильтры логов | ❌ | ❌ | |
| Локальный терминал (PTY) | ✅ | ✅ | |
| Context-pinned kubeconfig в shell | ✅ через прокси/shell sync | ✅ 0600 kubeconfig | |
| Несколько вкладок терминала | ✅ | ✅ | |
| Терминал: shell path | ✅ preferences | 🟡 `$SHELL` | |
| Терминал: font family/size/theme | ✅ | ✅ font only + built-in palette | |
| Terminal copy/paste prefs | ✅ | 🟡 | |
| Dock tabs (logs/terminal/create/edit) | ✅ | 🟡 только терминалы | |
| Fullscreen terminal | ✅ | ✅ | |
| Kubernetes API proxy (kubectl proxy) | ✅ | ❌ | |

---

## 7. Port forwarding

| Фича | Freelens | mLens | Комментарий |
|---|---|---|---|
| Port-forward из Pod | ✅ | ✅ | |
| Port-forward из Service | ✅ | ❌ | |
| Port-forward из Deployment | ✅ | ❌ | |
| Диалог выбора порта | ✅ | ✅ | |
| Страница активных port-forward | ✅ `network-port-forwards` | ✅ панель в top bar | |
| Stop/restart | ✅ | ✅ stop | |
| UDP | ❌ | ❌ | |
| Port-forward из NodePort? | 🟡 | ❌ | |

---

## 8. Helm

| Фича | Freelens | mLens |
|---|---|---|
| Список релизов | ✅ | ❌ |
| Install chart (wizard) | ✅ | ❌ |
| Values | ✅ | ❌ |
| History ревизий | ✅ | ❌ |
| Rollback | ✅ | ❌ |
| Delete release | ✅ | ❌ |
| Charts list + repositories | ✅ | ❌ |
| Server-side Helm | ✅ | ❌ |
| Helm binary path / download | ✅ | ❌ |
| Bundle Helm binary | ✅ (bundled) | ❌ (и не нужен) |

---

## 9. Metrics

| Фича | Freelens | mLens | Комментарий |
|---|---|---|---|
| Prometheus как источник | ✅ cluster settings + prefs | ❌ | |
| Prometheus address/TLS/path/token/method | ✅ | ❌ | |
| Cluster metrics + switchers | ✅ `cluster/cluster-metrics` | ❌ | |
| Pie charts (CPU/Mem by namespace/workload) | ✅ | ❌ | |
| Time range selector | ✅ | ❌ | |
| Node/pod/workload/namespace metrics | ✅ | 🟡 pod/node live | |
| Metrics в таблицах | ✅ | ✅ CPU/Mem | |
| Hide specific metrics | ✅ | ❌ | |
| Metrics-server fallback | ❌ | ✅ | у mLens основной |
| History / tренды | ✅ Prometheus | ❌ | |

---

## 10. Nodes и Pods

| Фича | Freelens | mLens |
|---|---|---|
| Node detail (capacity, conditions, pods) | ✅ | ✅ |
| Node metrics | ✅ | 🟡 live |
| Node shell | ✅ | ❌ |
| Node cordon/drain | ✅ | 🟡 cordon (в работе) |
| Node pod menu (pods on node) | ✅ | 🟡 Node column + filter |
| Pod detail (containers, env, volumes, conditions) | ✅ | ✅ |
| Pod metrics | ✅ | ✅ |
| Pod shell | ✅ | ✅ |
| Pod attach | ✅ | 🟡 backend (в работе) |
| Pod logs | ✅ | ✅ |
| Pod files / image FS | ❌ | ❌ |
| Workload overview (statuses, metrics, issues) | ✅ `workloads-overview` | 🟡 details only |
| Cluster issues overview | ✅ `cluster-issues.tsx` | ❌ |

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
| NetworkPolicies | ✅ | ✅ | |
| PortForwards page | ✅ | 🟡 панель | |
| PV / PVC / StorageClasses | ✅ | ✅ | |
| ServiceAccounts / Roles / Bindings | ✅ | ✅ | |
| PodSecurityPolicies | ✅ (deprecated) | ✅ generic | |
| Effective permissions / SSAR | ❌ | ❌ | |
| CertificateSigningRequests | 🟡 generic | ✅ generic | |

---

## 12. Расширения

| Фича | Freelens | mLens |
|---|---|---|
| Extension API (v2) | ✅ `packages/extensions`, `docs/extensions/api.md` | ❌ |
| Extension catalog / marketplace | ✅ `renderer/components/catalog` | ❌ |
| Install из файла / URL | ✅ | ❌ |
| Enable/disable extensions | ✅ `features/extensions/enabled` | ❌ |
| Extension settings pages | ✅ | ❌ |
| Extension pages/routes в UI | ✅ | ❌ |
| Custom resource extensions | ✅ | ❌ |
| Extension credentials (шифрованное хранилище) | ✅ `extension-credentials` | ❌ |
| Local extension dev (fixture-extension) | ✅ | ❌ |
| npm-пакет `@freelensapp/extensions` | ✅ | — |
| Плагины для mLens | — | ❌ |

Это самая большая функциональная разница: mLens принципиально без
extension-системы (`DESIGN_SPEC.md` §5).

---

## 13. Темы, настройки, клавиатура

| Фича | Freelens | mLens | Комментарий |
|---|---|---|---|
| Light/dark/system | ✅ | ✅ | |
| **YAML-темы: импорт/экспорт** | ✅ `docs/themes.md` | ❌ | |
| Тёмный и светлый вариант в одной теме | ✅ | 🟡 фиксированные пары | |
| Accent color | ✅ | ❌ | |
| Theme variant | ✅ | ❌ | |
| Monaco-токены в теме | ✅ | 🟡 встроенные темы | |
| Terminal ANSI-цвета в теме | ✅ | ✅ фиксированные | |
| Редактор: font, size, tab size, minimap, line numbers | ✅ | 🟡 Monaco fixed | |
| Терминал: shell path, font family/size, theme, copy/paste | ✅ | 🟡 font size/family | |
| Personalization preferences | ✅ | 🟡 3 темы | |
| Application prefs (timezone, hotbar auto-hide, startup, menu bar, sidebar) | ✅ | ❌ | |
| Kubernetes prefs (kubeconfig sync, kubectl binary/download/mirror, helm, combined logs) | ✅ | 🟡 sources only | |
| Proxy prefs (HTTP proxy, allow untrusted certs) | ✅ | ❌ | |
| Extension preferences tab | ✅ | ❌ | |
| Keyboard shortcuts registry | ✅ `business-features/keyboard-shortcuts` | 🟡 локальные обработчики | |
| Ремаппинг клавиш | ❌ | ❌ | |
| Справка по шорткатам | ❌ | ❌ | |
| Command palette | ✅ | ✅ | |
| Status bar info | ✅ | ✅ | |

---

## 14. Cluster settings (per-cluster)

| Настройка | Freelens | mLens |
|---|---|---|
| Имя кластера | ✅ | ❌ |
| Иконка (файл) и цвет | ✅ | 🟡 инициалы |
| Kubeconfig (просмотр/скачивание) | ✅ | 🟡 copy context |
| Accessible namespaces | ✅ | 🟡 namespace picker |
| Local terminal: working dir, default namespace | ✅ | 🟡 selected namespace |
| Metrics: скрыть/сбросить | ✅ | ❌ |
| Prometheus: address, HTTPS, path, token, method, mountpoints | ✅ | ❌ |
| Node shell image (Linux/Windows) + image pull secret | ✅ | ❌ |
| Proxy (per-cluster) | ✅ | ❌ |
| Skip namespace authorization check | ✅ | ❌ |
| Скорость/performance | ✅ | ❌ |

---

## 15. Дистрибуция и безопасность

| Фича | Freelens | mLens |
|---|---|---|
| macOS DMG/PKG (arm64/amd64) | ✅ | ✅ DMG/zip (unsigned) |
| Windows NSIS/MSI/portable | ✅ | ✅ NSIS (не собран) |
| Linux deb/rpm/AppImage | ✅ | ✅ deb/AppImage (не собран) |
| Flatpak / Snap / AUR / APT repo | ✅ | ❌ |
| Homebrew / WinGet / Scoop | ✅ | ❌ |
| Bundled kubectl/helm | ✅ | ❌ (и не нужен) |
| Auto-update | ❌ | ❌ |
| Secret store для расширений | ✅ | — |
| Sandboxed renderer | ✅ | ✅ |
| Kubeconfig не изменяется | ✅ | ✅ |
| Telemetry | ❌ (Freelens без телеметрии) | ❌ |

---

## 16. Чего у Freelens нет, а у mLens есть

1. **Вкладки открытых кластеров** (top cluster tabs) — у Freelens только hotbar.
2. **Вкладки открытых ресурсов** с back stack — Freelens открывает один drawer.
3. **Вкладки внутри drawer** (Overview/Details/YAML/Events/Related/Logs/
   Metrics) — у Freelens drawer это один скролл секций, а логи/YAML уходят
   в dock.
4. **Bulk-выделение и bulk-delete** в таблицах.
5. **Regex-поиск** и **Problems-фильтр**.
6. **Порядок колонок** (Freelens: только resize/скрытие).
7. **HPA-guard** при ручном scale.
8. **Pause/Resume rollout** для Deployment.
9. **Force delete**.
10. **Каталог кластеров с удалением/восстановлением** (неразрушающим).
11. **Dracula**-тема из коробки (в Freelens можно импортировать YAML-тему).
12. **Плотность Radar**: 44px строки, 12px uppercase заголовки, компактные
    бейджи, настраиваемая высота строк 24–52px.
13. **Меньше зависимостей**: без kubectl/helm-бинарей, без extension runtime.

---

## 17. Приоритеты для mLens

Freelens — родитель оболочки, поэтому «догонять» имеет смысл только там, где
это усиливает продукт, а не копирует конкурента.

### P0 — дешёвые и заметные

1. **Resource templates** в Create YAML (30+ готовых шаблонов + свои) — почти
   бесплатно, сильно улучшает onboarding.
2. **Combined/workload logs** в dock — mLens уже умеет стримить логи пода.
3. **Download всех логов** пода/workload (сейчас только текущий буфер).
4. **Port-forward из Service и Deployment** (данные уже есть, нужен резолв
   pod-селектора).
5. **Node shell** и **pod attach** (attach-режим уже начат в main).
6. **Certificate details** для TLS Secret (x509 в Node).
7. **Cluster settings**: имя, иконка/цвет, default namespace, node shell image,
   image pull secret, per-cluster proxy — по мере надобности.
8. **Terminal shell path** и editor preferences в настройках.

### P1 — крупные, но ожидаемые

9. **Helm** (releases + charts + repos + rollback) — сейчас главный
   функциональный пробел относительно Freelens.
10. **Prometheus-источник** и графики (кластер, node, pod, workload, time
    range) — расширяет текущие live-метрики.
11. **Cluster Overview** — довести начатый экран до pie charts/time range/
    issues.
12. **Workloads overview** — отдельная страница статусов, а не только drawer.
13. **Cluster settings UI** (per-cluster) — сейчас настройки глобальные.

### P2 — стратегические

14. **Extensions API** — самое дорогое и самое спорное: mLens явно
    позиционируется без extension-системы. Решать осознанно.
15. **YAML-темы** (импорт/экспорт, accent, Monaco/terminal tokens) — можно
    сделать поверх текущих CSS-токенов.
16. **Kubeconfig sync** из каталогов (сейчас — статические sources).
17. **Deep links** (`freelens://`); авто-обновление — по желанию, у Freelens его тоже нет.
18. **Flatpak/Snap/Homebrew** для дистрибуции.
19. **i18n** (у Freelens её тоже нет).

---

## 18. Замечания

1. **Hotbar 75px vs 54px** — не ошибка документации: Freelens 2 по-прежнему
   использует `--hotbar-width: 75px` (`cluster-manager.scss`), а mLens
   сознательно ужал рельс до 54px под плотность Radar. Это осознанное отличие,
   а не расхождение с родителем.
2. **Freelens 2.x** сильно отличается от Lens 6, на который ориентировались
   документы mLens: появились `cluster-sidebar`, `list-layout`, YAML-темы,
   extension API v2, catalog sources, combined logs. При сверке «как в
   Freelens» стоит смотреть именно эту ветку.
3. **Extension-система** — единственная фича, которую mLens сознательно не
   копирует (`DESIGN_SPEC.md` §5). Это не «долг», а продуктовое решение; в
   сравнении она отмечена как ❌, чтобы не путать с забытой функцией.
4. **Helm и метрики** — два самых заметных пользовательских пробела; оба
   реализуемы без бинарей и без Go, в отличие от Freelens-подхода с
   бандлом `helm`/`kubectl`.
