# Lens → mLens: что есть, чего нет

Сравнение фич **Lens K8S IDE** и **mLens 0.1.0** (этот репозиторий).

Источник Lens: официальная документация `https://docs.lenshq.io` и release
notes, версия **2026.11.91422-latest** (ноябрь 2026), продукт Mirantis. Lens —
проприетарный преемник открытого Lens; Freelens — форк открытого ядра, а mLens
строился по shell-механикам Freelens и визуальному языку Radar.

Модель Lens: обязательная активация через **Lens ID**, есть **Lens Personal**
(бесплатный план; доступность зависит от условий), **Plus / Pro / Enterprise**
(подписка) и **14-дневный trial**.
Часть функций помечена в документации как premium.

Историю появления фич и момент перехода в premium см. в **§19**.

Обозначения: ✅ есть · 🟡 частично · ❌ нет · 💰 только на платном плане ·
— не применимо. Пометка **(в работе)** — есть только в незакоммиченных
изменениях mLens (`git status`), хотя `AGENTS.md` уже описывает это как
целевое поведение.

---

## TL;DR

**Lens сильнее в платформе:** продаваемые premium-функции (AI, MCP, GitOps,
cost, security, cloud discovery, Teamwork, Lens Studio), встроенный Prometheus-
стек, зрелые логи, поиск с сохранением, Helm, расширения и корпоративные
аккаунты.

**mLens сильнее в свободе и фокусе:** MIT, без аккаунта, активации, облака и
телеметрии; всё, что есть, работает локально. Часть того, что у Lens платно
(hotbar, split-подобные вкладки, расширения), у mLens либо бесплатно, либо
сознательно отсутствует.

**Главный вывод:** mLens уже закрывает базовый **бесплатный** tier Lens
(ресурсы, детали, логи, терминал, поиск, CRD, namespaces) и заметно превосходит
его по плотности и shell-механике, но уступает в Helm, Overview, Applications,
saved searches, CSV и продвинутых логах. Основной разрыв — **платный** tier
Lens.

---

## 1. Модель продукта, аккаунты, лицензирование

| Фича | Lens | mLens | Комментарий |
|---|---|---|---|
| Лицензия | проприетарная | MIT | |
| Аккаунт | обязателен Lens ID | не нужен | |
| Активация | онлайн/офлайн | не нужна | |
| Бесплатный план | Lens Personal (условно-бесплатный) | — (всё бесплатно) | |
| Платные планы | Plus / Pro / Enterprise | — | |
| Trial | 14 дней | — | |
| SSO/SCIM | 💰 Business ID: Entra, Okta, JumpCloud | ❌ | |
| Seats / billing | 💰 Lens ID Portal, AWS Marketplace | ❌ | |
| Air-gapped / offline activation | 💰 Enterprise | — | |
| Feature management (админ отключает фичи) | 💰 Enterprise | ❌ | |
| Телеметрия | есть (аккаунт/облако) | ❌ | |
| Cloud-зависимость | для cloud-фич и активации | отсутствует | |

---

## 2. Оболочка, layout, вкладки, окна

Layout Lens: Title Bar, Hotbar, Command Panel (Navigator), **Tab Bar**,
Workspace, Dock, Status Bar.

| Фича | Lens | mLens | Комментарий |
|---|---|---|---|
| Одно главное окно | ✅ | ✅ | |
| Tab Bar: вкладки разных кластеров | ✅ | ✅ | у Lens с preview-режимом |
| Вкладки открытых ресурсов | ✅ | ✅ | |
| Preview-режим вкладки (одиночный клик) | ✅ | ❌ | |
| История вкладок back/forward | ✅ | 🟡 back stack, forward disabled | |
| Закрытие вкладки, Ctrl+W | ✅ | ✅ | |
| Переключение вкладок Ctrl+number | ✅ | 🟡 | |
| **Split screen (2+ групп вкладок)** | 💰 Lens Studio | ❌ | |
| **Tab в отдельном окне** | 💰 Lens Studio | ❌ | |
| Cascade windows | 💰 Lens Studio | ❌ | |
| Hotbar | 💰 12 ячеек, несколько банков, F1–F12 | ✅ 10 слотов | mLens даёт бесплатно |
| Dock | ✅ logs/terminal/templates | 🟡 только терминалы | |
| Status bar | ✅ + support chat | ✅ | |
| Title bar: меню, уведомления, история, user menu | ✅ | 🟡 | |
| Onboarding wizard (5 шагов) | ✅ | ❌ | |
| Command Palette | ✅ `⌘⇧P` | ✅ `⌘K` + поиск ресурсов (в работе) | |
| Настройки темы: sync/dark/light | ✅ | ✅ + Dracula/Freelens | |
| Кастомные темы | ❌ | ✅ 3 встроенные | |
| Плотность таблиц / высота строк | ❌ | ✅ 24–52px | |
| Multi-window без Lens Studio | ❌ | ❌ | |

---

## 3. Кластеры, подключение, cloud, teamwork

| Фича | Lens | mLens | Комментарий |
|---|---|---|---|
| Локальные kubeconfigs | ✅ Local Kubeconfigs | ✅ | |
| Добавить кластер из kubeconfig (paste/file) | ✅ | ✅ | |
| Ручное управление kubeconfig | ✅ | ✅ | |
| **Авто-обнаружение EKS** | 💰 AWS integration | ❌ | |
| **Авто-обнаружение AKS** | 💰 Azure integration | ❌ | |
| **Авто-обнаружение GKE** | 💰 Google integration | ❌ | |
| OpenShift cluster | ✅ | 🟡 обычный Kubernetes | |
| Lens Teamwork Spaces | 💰 | ❌ | |
| Cluster Connect (BoreD, без VPN) | 💰 | ❌ | |
| Приглашения/RBAC spaces | 💰 | ❌ | |
| Kubeconfig sync из каталогов | ❌ (выбор файлов) | 🟡 sources | |
| Каталог кластеров с remove/restore | ❌ | ✅ неразрушающий | |
| Hotbar (закрепление кластеров) | 💰 | ✅ | |
| Cluster tabs / переключение | ✅ | ✅ | |
| Параллельные подключения | ✅ | ✅ | |
| Cluster settings per-cluster | ✅ | 🟡 глобальные | |

---

## 4. Navigator / sidebar

| Фича | Lens | mLens | Комментарий |
|---|---|---|---|
| Разделы: Kubernetes Clusters, Teamwork, Extensions | ✅ | 🟡 кластеры | |
| Группировка: Local / EKS / AKS / GKE | ✅ (по плану) | ❌ | |
| Дерево ресурсов кластера | ✅ | ✅ | |
| Поиск кластера по имени | ✅ `Ctrl+P` | 🟡 палитра | |
| Счётчики ресурсов | ✅ | ✅ | |
| Namespace filter | ✅ | ✅ | |
| Favorites / pinned | ✅ | ✅ | |
| Перестановка разделов | ✅ | 🟡 drag групп | |
| Скрытие items | ✅? | ❌ | |
| RBAC-скрытие недоступного | 🟡 (RBAC-виды; скрытие не документировано) | ❌ | |
| Extensions section (create/marketplace/installed) | ✅ | ❌ | |
| Device Resources (DRA) section | ✅ | ❌ | |
| Flux/Argo entries | 💰 | ❌ (generic CRD) | |
| Helm entry | ✅ | ❌ | |

---

## 5. Списки ресурсов и поиск

| Фича | Lens | mLens | Комментарий |
|---|---|---|---|
| Все встроенные виды | ✅ | ✅ | |
| CRD и custom resources | ✅ | ✅ | |
| Printer columns CRD | ✅ | ✅ | |
| Smart-колонки по kind | ✅ | ✅ | |
| Сортировка | ✅ | ✅ | |
| Resize колонок | ✅ | ✅ | |
| **Перестановка колонок drag** | ✅ | ✅ | |
| Скрытие колонок | ✅ | ✅ | |
| Pin колонок | ❌ | ❌ | |
| Кастомные колонки из label/annotation | ❌ | ❌ | |
| Поиск по списку | ✅ | ✅ | |
| **Case-sensitive поиск** | ✅ | 🟡 regex-режим | |
| **Regex-поиск** | ✅ | ✅ | |
| **Recent searches** | ✅ | ❌ | |
| **Favorite searches, общие для всех кластеров** | ✅ | ❌ | |
| Фильтры по колонкам | ✅ | ✅ include | |
| Problems-фильтр | ❌ | ✅ | |
| Bulk-выделение/удаление | 🟡 (не документировано) | ✅ | |
| CSV export таблиц | ✅ (Nodes, PF, Security) | ❌ | |
| Virtualized-списки | ✅ (50k pods) | ✅ | |
| Metrics-колонки | ✅ CPU/Mem/Disk | ✅ CPU/Mem | |
| Обновление через watch | ✅ | ✅ | |
| Namespace multi-select | ✅ | ✅ | |
| Create resource: шаблоны | ✅ | ❌ | |
| Create resource: диалоги (NS/Secret/Quota/RBAC) | ✅ | ❌ | |
| Resource templates | ✅ | ❌ | |

---

## 6. Детали ресурса и редактор

| Фича | Lens | mLens | Комментарий |
|---|---|---|---|
| Details panel | ✅ | ✅ | |
| Вкладки внутри панели | ❌ (секции + Copy/Edit/Delete) | ✅ 7 вкладок | mLens структурнее |
| Copy name | ✅ | ✅ | |
| Edit → YAML | ✅ | ✅ | |
| Delete | ✅ | ✅ | |
| **Advanced editor: diff unsaved vs loaded** | 💰 | ❌ | |
| **Revert в один клик** | 💰 | ❌ | |
| Server-side dry-run | ❌ | ✅ | mLens безопаснее |
| YAML apply | ✅ | ✅ | |
| Secret values view/edit | ✅ | ✅ | |
| ConfigMap value edit | ✅? | ✅ | |
| Certificate details (TLS Secret) | ❌ | ❌ | |
| Events по объекту | ✅? | ✅ | |
| Related resources | 🟡 | 🟡 (в работе) | |
| Conditions/probes/affinity | ✅ | ✅ | |
| Metrics в деталях | ✅ (Prometheus) | 🟡 live metrics-server | |
| Deep links | ✅? | — | desktop |
| Copy kubectl command | ✅? | ✅ | |
| Force delete | 🟡 (не документировано) | 🟡 (в работе) | |

---

## 7. Workloads и действия

| Действие | Lens | mLens | Комментарий |
|---|---|---|---|
| Scale | ✅ Deployment/StatefulSet/RS | ✅ + HPA-guard | mLens блокирует при HPA |
| Restart | ✅ Deployment и др. | ✅ | |
| Pause/Resume rollout | ❌ | ✅ | преимущество mLens |
| Suspend/Resume Job/CronJob | ✅ | ✅ | |
| CronJob Trigger | 🟡 (не документировано) | ✅ (в работе) | |
| Set image | 🟡 (не документировано) | ✅ (в работе: обычные контейнеры) | |
| Revision history/rollback | 🟡 (не документировано) | ❌ | |
| Node Shell | ✅ | ❌ | |
| Node Cordon/Drain | ✅ | ✅ (в работе) | |
| Node Edit/Delete | ✅ | ✅ delete; edit YAML | |
| Pod Shell | ✅ | ✅ | |
| Pod Attach | 🟡 (документирован только shell) | 🟡 backend (в работе) | |
| Pod logs | ✅ | ✅ | |
| Port-forward из Pod | ✅ | ✅ | |
| Port-forward из Service/Deployment | 🟡 (документирован только Pod) | ❌ | |
| Argo Rollouts actions (promote/pause/abort/retry) | 💰 | ❌ | |
| Workloads overview | ✅ | 🟡 drawer | |
| Applications view | ✅ | ❌ | |

---

## 8. Логи, терминал, dock

| Фича | Lens | mLens | Комментарий |
|---|---|---|---|
| Логи в dock | ✅ | ❌ (в drawer) | |
| Container selector (вкл. init) | ✅ | 🟡 без init | |
| Timestamps | ✅ | ✅ | |
| Previous container | ✅ | ✅ | |
| Word wrap | ✅ | ❌ | |
| Filter logs (toggle) | ✅ | ✅ search | |
| Show resource names | ✅ | ❌ | |
| Move to controlling resource logs | ✅ | ❌ | |
| Latest event in log | ✅ | ❌ | |
| Download logs | ✅ | 🟡 текущий буфер | |
| Combined/workload logs | 🟡 (не документировано) | ❌ | |
| Терминал в dock | ✅ | ✅ | |
| Несколько вкладок терминала | ✅ | ✅ | |
| Dock tabs для logs/edit/templates | ✅ | 🟡 | |
| Terminal font/size/theme | ✅ | 🟡 | |
| Terminal shell path | ✅ | 🟡 `$SHELL` | |
| Copy/paste настройки | ✅ | 🟡 | |
| Tabs в отдельном окне (логи/терминал) | 💰 Lens Studio | ❌ | |
| Log search/next | ✅ | ✅ | |

---

## 9. Helm и Port Forwarding

| Фича | Lens | mLens | Комментарий |
|---|---|---|---|
| Helm Charts | ✅ | ❌ | |
| Helm Releases | ✅ | ❌ | |
| Install/Upgrade | ✅ | ❌ | |
| Rollback/history | ✅ | ❌ | |
| Repositories + OCI + storage backends | ✅ | ❌ | |
| Values editor | ✅ | ❌ | |
| Helm в Preferences | ✅ | ❌ | |
| Port Forwarding view | ✅ | 🟡 панель | |
| Start/stop/edit forward | ✅ | 🟡 stop | |
| CSV export | ✅ | ❌ | |
| Port-forward из Pod | ✅ | ✅ | |
| Port-forward из Service/Deployment | 🟡 (документирован только Pod) | ❌ | |
| Сохранение форвардов после рестарта | 🟡 (не документировано) | ❌ | |

---

## 10. Metrics и Overview

| Фича | Lens | mLens | Комментарий |
|---|---|---|---|
| Встроенный Lens Metrics (установка Prometheus) | ✅ | ❌ | |
| Prometheus providers (Lens/Helm/Helm 14/Operator/OpenShift/Stacklight) | ✅ | ❌ | |
| Prometheus config/query format | ✅ | ❌ | |
| Cluster Overview: CPU/Mem/Pods | ✅ | 🟡 (в работе) | |
| Usage / Requests / Limits / Allocatable / Capacity | ✅ | 🟡 allocatable only | |
| Time range 1h–2 месяца | ✅ | ❌ | |
| Master/worker разделение | ✅ | ❌ | |
| Issues section на Overview | ✅ | ❌ | |
| Node/Pod/Namespace metrics | ✅ | 🟡 live | |
| Metrics в таблицах | ✅ | ✅ | |
| Metrics в деталях (графики) | ✅ | 🟡 значения | |
| HPA/Ingress/PVC графики | 🟡 (частично) | ❌ | |
| Metrics server (metrics.k8s.io) | 🟡 | ✅ | |
| Скрытие метрик по типу | 🟡 (не документировано) | ❌ | |

---

## 11. GitOps, Cost, Security, DRA, Gateway

| Фича | Lens | mLens | Комментарий |
|---|---|---|---|
| Flux CD dashboard + виды + статус на workloads | 💰 | ❌ | |
| Argo CD dashboard + виды + sync/refresh | 💰 | ❌ | |
| Argo Rollouts promote/pause/abort/retry | 💰 | ❌ | |
| Cost Monitoring (24h/7d/30d, namespace, idle, efficiency) | 💰 | ❌ | |
| Cost из OpenCost/Kubecost или оценка | 💰 | ❌ | |
| Optimize cost with AI | 💰 | ❌ | |
| Security Center (Trivy): images/resources/roles | 💰 | ❌ | |
| CSV export vuln report | 💰 | ❌ | |
| Air-gapped scanning | 💰 | ❌ | |
| Gateway API views | ✅ | 🟡 generic CRD | |
| Device Resources (DRA) 4 вида | ✅ (1.34+) | 🟡 generic CRD | |
| Applications view (labels, managed by, violations) | ✅ | ❌ | |
| Cluster Performance doc | ✅ | — | |

---

## 12. AI, MCP, CLI

| Фича | Lens | mLens | Комментарий |
|---|---|---|---|
| Ask AI: запуск AI CLI в терминале с контекстом | 💰 | ❌ | |
| Ask AI actions по ресурсу (summarize/events/metrics/logs) | 💰 | ❌ | |
| AI control of Lens (видно, кто управляет) | 💰 | ❌ | |
| Lens MCP Server | 💰 | ❌ | |
| MCP Kubernetes tools (list/connect, read-only kubectl) | 💰 | ❌ | |
| MCP Prometheus tools (7: metrics/alerts/targets/queries) | 💰 | ❌ | |
| MCP Lens tools (open resources/logs/terminal, Helm, PF, cost) | 💰 | ❌ | |
| MCP extension tools | 💰 | ❌ | |
| Lens CLI (`lens clusters`, tokens, teamwork) | 💰 | ❌ | |
| REST API | ❌ (MCP/CLI only) | ❌ (IPC) | |
| Плагины/расширения AI | ✅ | ❌ | |

---

## 13. Extensions

| Фича | Lens | mLens |
|---|---|---|
| Extension API | ✅ | ❌ |
| Marketplace (npm, `lens-extension`) | ✅ (browse free) | ❌ |
| Install из marketplace | 💰 | ❌ |
| Install локально для разработки | 💰 | ❌ |
| Update extensions (auto/hourly) | 💰 | ❌ |
| Compatibility с версией Lens | ✅ | ❌ |
| Safe mode | ✅ | ❌ |
| Extension governance | ✅ | ❌ |
| Publish extension | ✅ | ❌ |
| Extension settings/pages/slots | ✅ | ❌ |
| Extension tools в MCP | 💰 | ❌ |

---

## 14. Preferences, темы, клавиатура

| Фича | Lens | mLens | Комментарий |
|---|---|---|---|
| Тема: sync/dark/light | ✅ | ✅ | |
| Кастомные темы | ❌ | ✅ 3 встроенные | |
| Accent color | ❌ | ❌ | |
| Start-up at login | ✅ | ❌ | |
| Update channel stable/beta/alpha | ✅ | ❌ | |
| Locale timezone | ✅ | 🟡 системная | |
| Lens CLI toggle | 💰 | — | |
| HTTP Proxy / untrusted CA | ✅ | ❌ | |
| Kubernetes prefs: kubectl, kubeconfig | ✅ | 🟡 sources | |
| Helm prefs: repos/OCI/storage | ✅ | ❌ | |
| Editor prefs | 🟡 (не документировано) | 🟡 Monaco fixed | |
| Terminal prefs | ✅ | 🟡 | |
| Saved/favorite searches | ✅ | ❌ | |
| Shortcuts (палитра, вкладки, split, hotbar) | ✅ | 🟡 базовые | |
| Ремаппинг клавиш | ❌ | ❌ | |
| Справка по шорткатам | ❌ | ✅ (в работе: `?`) | |

---

## 15. Дистрибуция и безопасность

| Фича | Lens | mLens |
|---|---|---|
| macOS / Windows / Linux | ✅ | ✅ |
| Auto-update + каналы | ✅ | ❌ |
| Homebrew / WinGet / Snap / Flatpak | 🟡 (не документировано) | ❌ |
| Lens CLI в PATH | 💰 | ❌ |
| Air-gapped установка | 💰 | — |
| SBOM / integrity checks | 🟡 (integrity check есть; SBOM не документирован) | ❌ |
| Sandboxed renderer | ✅ | ✅ |
| Локальные креденшелы не уходят в облако | 🟡 (аккаунт/облако) | ✅ |
| Работа без интернета | 🟡 (активация) | ✅ |
| Телеметрия | ✅ | ❌ |

---

## 16. Чего у Lens нет, а у mLens есть

1. **Бесплатно и без аккаунта**: Lens требует Lens ID и активацию; часть
   привычных фич (hotbar, extensions, split) — платно.
2. **Hotbar бесплатно** (у Lens это premium).
3. **Полностью локальная работа** без облака, телеметрии и активации.
4. **Dracula-тема** и выбор из 3 тем (у Lens только sync/dark/light).
5. **Плотность Radar**: 44px строки, uppercase-заголовки, настраиваемая высота
   24–52px.
6. **HPA-guard** при ручном scale.
7. **Pause/Resume rollout** для Deployment.
8. **Вкладки внутри drawer** (Overview/Details/YAML/Events/Related/Logs/
   Metrics).
9. **Неразрушающий каталог** кластеров с remove + restore.
10. **Regex-поиск уже сейчас** (у Lens тоже есть, но mLens даёт его в связке с
    Problems-фильтром).
11. **Server-side dry-run** перед apply.
12. **Прозрачный MIT-код** и отсутствие vendor lock-in.
13. **Меньше зависимостей**: без kubectl/helm-бинарей, без Lens Cloud.
14. **Per-kind глобальные ширины колонок**, общие для кластеров.
15. **Set image, CronJob Trigger, Drain** — уже в работе; у Lens часть из
    этого не документирована.
16. **Глобальный поиск ресурсов в палитре** и оверлей шорткатов `?`.

---

## 17. Приоритеты для mLens (с оглядкой на Lens)

Сначала закрывать **бесплатный tier** Lens, а не гнаться за premium.

### P0 — бесплатные фичи Lens, которых нет

1. **Helm** (charts/releases/install/upgrade/rollback/repos) — главный
   бесплатный пробел.
2. **Cluster Overview** — довести начатый экран до CPU/Mem/Pods,
   requests/limits/allocatable, time range, Issues.
3. **Saved/recent/favorite searches** — общие для списков и кластеров.
4. **CSV export** таблиц (минимум Nodes/PortForwarding).
5. **Продвинутые логи**: move to controlling resource, show resource names,
   filter toggle, latest event, дата/время.
6. **Port-forward из Service/Deployment** + сохранение после рестарта.
7. **Applications view** (labels, managed by, status, violations).
8. **Cluster settings**: имя, иконка, kubeconfig, proxy, accessible namespaces,
   terminal working dir/default namespace.
9. **Resource templates** и **диалоги создания** (NS/Secret/Quota/RBAC).
10. **Node Shell** (cordon/drain/set image/trigger уже в работе).
11. **DRA views** (ResourceClaims/Templates/DeviceClasses/ResourceSlices) —
    discovery уже даёт эти виды.
12. **Gateway API dedicated views** (HTTPRoute/GRPCRoute/Gateway).
13. **Terminal shell path** и расширенные настройки шрифтов.

### P1 — крупные бесплатные/условно-бесплатные

14. **Lens-подобный Metrics**: встроенный Prometheus-провайдер, providers,
    графики и time range. Сейчас только live metrics-server.
15. **Split view** (2 группы вкладок) — у Lens это Lens Studio (premium), но
    mLens может дать бесплатно как преимущество.
16. **Tabs в отдельном окне** — сильный differentiator, если решимся.
17. **Advanced editor**: diff unsaved/loaded + revert (у Lens premium).
18. **Preview-режим вкладок** и история вкладок forward.
19. **Workloads overview** и **Cluster Performance**-показатели.
20. **Terminal shell path** и доп. шрифты.

### P2 — платный tier Lens (осознанно, не для паритета)

21. **Ask AI** (локальный AI CLI) — идеологически ближе к Radar.
22. **MCP Server** (read-only kubectl/Prometheus + Lens tools).
23. **Flux/Argo CD/Argo Rollouts** дашборды и действия.
24. **Cost Monitoring** (OpenCost/Kubecost/оценка).
25. **Security Center** (Trivy CRD + views).
26. **Cloud discovery** EKS/AKS/GKE.
27. **Teamwork/SSO/SCIM** — противоречит локальной модели mLens.
28. **Extensions marketplace** — сознательно вне scope.

---

## 18. Замечания

1. **Lens сейчас — платный продукт с free-tier Personal.** Многие「фичи
   Freelens」в современном Lens стали premium: hotbar, extensions, split view,
   advanced editor, cloud discovery, GitOps, AI/MCP, cost, security, Lens CLI.
   Сравнивать mLens с Lens «как с бесплатным» уже нельзя.
2. **Freelens — форк открытого ядра Lens, а не текущего Lens.** Поэтому
   `FREELENS_VS_MLENS.md` и этот файл расходятся: то, что Freelens 2 отдаёт
   бесплатно, в Lens может быть платным, и наоборот (Lens Studio, saved
   searches, CSV, встроенный Prometheus).
3. **Lens Tab Bar ≠ вкладки Freelens.** У Lens есть preview-вкладки и история
   вкладок; у Freelens — siblings + drawer. mLens ближе к Freelens, но с
   отдельными cluster tabs.
4. **Lens требует активацию Lens ID даже для бесплатного использования**, а
   offline/air-gapped — только Enterprise. Для mLens это принципиально другая
   модель.
5. **Lens использует внутренние прокси и kubectl/helm**, mLens — Kubernetes
   API/WebSocket напрямую. Часть фич Lens (drain, node shell) в mLens требует
   отдельной реализации.
6. **Не копировать premium-функции ради галочки.** Ask AI, MCP, Teamwork,
   cloud discovery и Security Center — это отдельные подсистемы; их место — в
   Radar-style roadmap, а не в первом релизе mLens.

---

## 19. Таймлайн фич Lens (2023–2026)

Составлено по 53 release notes с `docs.lenshq.io/release-notes/lens-k8s-ide`.
Даты — релизные, версии — как в документации. 💰 — на момент появления фича
была или стала платной.

### 2023 — база и первые premium-фичи

| Когда | Что появилось | Статус |
|---|---|---|
| 2023.03 | **Lens Security Center**: поиск уязвимостей и мисконфигураций в images/resources/roles, автоматическое сканирование через оператор | 💰 (сейчас premium) |
| 2023.04 | Security Center: overview с графиком и CSV-экспортом; native terminal для docker CLI в Lens Desktop Kube | 💰 |
| 2023.06 | Отдельные виды Mutating/ValidatingWebhookConfiguration; Eviction API с учётом PDB; удаление subNamespaces; welcome в hotbar | free |
| 2023.08 | **Resizable columns**; **log aggregation** по подам и деплойментам; ускорение Workload Overview | free |
| 2023.09 | **Applications view** на Recommended Labels (`app.kubernetes.io/*`) | free |
| 2023.12–2024.01 | **Metrics 2.0**: события на графиках, зум, произвольный диапазон; **shareable links** на кластер/раздел; pinnable search bar; kubectl on-demand | free |

### 2024 — редизайн и EKS

| Когда | Что появилось | Статус |
|---|---|---|
| 2024.07 | Автоматическое переподключение port-forward после VPN/сети | free |
| 2024.09–10 | **Большой редизайн**: новый UI/UX, **Unified Navigator**, **Tabbed Navigation**, переработанная details panel, Advanced Metrics с event overlay | free |
| 2024.09 | **Direct AWS EKS integration** (discovery + IAM) | 💰 Lens Pro |
| 2024.09 | Обновлённый Teamwork / Spaces | 💰 |

### 2025 — hotbar, Prism, EKS, OCI Helm

| Когда | Что появилось | Статус |
|---|---|---|
| 2025.01 | Человекочитаемый deployment status; колонки DaemonSet; **TLS-сертификаты в Secret**; иконки в Navigator; поиск и переход к ресурсам из палитры; bypass internal proxy; переход к parent resource из логов; удаление контекстов; активный кластер в status bar | free |
| 2025.03–04 | **Hotbar вернулся**; следующее выполнение CronJob; **persistent column visibility per cluster**; Prometheus HTTPS; баннеры node/pod shell; цвет кластера из иконки | 💰 Hotbar — Pro/Enterprise |
| 2025.05 | Метки на hotbar; новые цвета тёмной темы; одинаковая ширина вкладок; события Pod start/terminate в метриках; подсветка выбранного объекта; hotbar cluster settings; шрифт 14px | free |
| 2025.06 | **Binary integrity checks**; Prometheus path prefix; кастомизация внешнего вида кластера; история навигации с details; высота строк таблиц | free |
| 2025.06–07 | **Lens Prism** — AI-ассистент в десктопе (natural language, kubeconfig, RBAC, OpenAI-совместимые модели); управление AWS-профилями из UI; «Add to Hotbar» из навигатора | 💰 Prism — Premium |
| 2025.08 | Prism: HTTPS proxy, автоскролл; EKS: предупреждения об истечении профиля, авто-раскрытие узлов; стабильность node shell | 💰 Prism |
| 2025.09 | EKS Assume Role и Access Key; **OCI Helm registries**; shortcut терминала; визуализация tool calls Prism; календарь логов; единый формат дат | OCI/free; Prism 💰 |
| 2025.10 | Prism **Agent mode** (многошаговые задачи), «Ask Prism» в details и у warning-иконок, контекст списка/namespace/ресурса, подтверждение skills, web search; автоподбор ширины колонки | 💰 Prism |

### 2026 — MCP, GitOps, cost, Studio, расширения

| Когда | Что появилось | Статус |
|---|---|---|
| 2026.01 | **Azure AKS integration**; Prism: ссылки на ресурсы, выбор модели/режима; улучшенная клавиатурная навигация по таблицам | AKS 💰; Prism 💰 |
| 2026.02 | «Ask Prism» в таблицах; **Prism UI-control skill**; группировка AKS по ResourceGroup; PV kinds; фиксы колонок и графиков | 💰 Prism |
| 2026.03 | **MCP Server** (Kubernetes и Prometheus tools); Prism terminal skill, Anthropic BYOK, несколько AI-конфигураций, cloud context; Integrations preferences; onboarding; **EndpointSlice** | MCP/Prism 💰 |
| 2026.04 | Редизайн onboarding; обновлённые диалоги; light theme; recovery после миграции | free |
| 2026.05 | **Gateway API group** (Gateway/HTTPRoute/GRPCRoute/TCP/TLS/UDP/ReferenceGrant/BackendTLS/ListenerSet); **Validating/MutatingAdmissionPolicy** с CEL-подсветкой; webhook match conditions | free |
| 2026.06 | **Flux CD** dashboard + все Flux kinds; **Ask AI** с выбором CLI (Claude Code, Copilot, Gemini, Codex, custom); Premium Features dashboard и trial | 💰 Flux и Ask AI |
| 2026.08 | **Lens Turbo** (ускорение до 20×); **Argo CD** dashboard/виды/sync/refresh; Electron 43; поиск cordoned nodes; сортировка Node Conditions; кэш Helm-репозиториев | Argo CD 💰; Turbo free |
| 2026.08 | **Advanced editor**: side-by-side diff и revert | 💰 |
| 2026.09 | **Cost Monitoring** (день/неделя/месяц, idle, efficiency, OpenCost/Kubecost или оценка); VictoriaMetrics auto-detect; Azure Gov/China; PriorityClass pods | Cost 💰; остальное free |
| 2026.10 | **Extensions revamp**: раздел в Navigator, создание расширения через AI, Marketplace, install/update/publish | установка 💰 |
| 2026.10 | **Ask AI видит экран и управляет Lens** (с согласием), pointer/ring, скорость, «забрать управление» | 💰 |
| 2026.10 | **Lens Studio**: split screen, вкладки в отдельных окнах, Cascade Windows, Ask AI раскладывает вкладки | 💰 Plus/Pro/Enterprise |
| 2026.11 | Быстрый старт (2×); **saved searches** (recent/favorite, общие для кластеров); **Argo Rollouts** (promote/pause/retry); больше AI-действий; аудит версий расширений; EKS MFA; группировка уведомлений | Saved searches free; Argo Rollouts 💰; AI 💰 |

### Когда Lens «стал платным»

Единой даты нет: подписки и Teamwork существовали раньше, но в этом окне
виден постепенный сдвиг:

1. **2023** — Security Center появляется как встроенная, затем становится
   premium-функцией.
2. **2024.09** — EKS-интеграция прямо помечена «Lens Pro feature»; редизайн и
   вкладки остаются бесплатными.
3. **2025.04** — Hotbar возвращается как **Pro/Enterprise**.
4. **2025.06** — Lens Prism (AI) — только Premium.
5. **2026.06–2026.11** — premium-волна: Flux, Ask AI, Argo CD, Advanced editor,
   Cost Monitoring, Lens Studio (split/окна), установка расширений, Argo
   Rollouts.
6. Параллельно **2026.10** — расширения переезжают в Navigator и получают
   AI-создание/маркетплейс, но установка остаётся платной.

Итог: бесплатный Lens 2026 — это крепкий Kubernetes-клиент (виды, Helm,
метрики, логи, терминал, поиск, DRA/Gateway, Applications). Всё, что делает
его «платформой» (AI, MCP, GitOps, cost, security, cloud discovery, Teamwork,
Studio, hotbar), — подписка.
