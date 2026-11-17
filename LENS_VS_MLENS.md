# Lens → mLens: что есть, чего нет

Сравнение фич **Lens K8S IDE** и **mLens** (текущий код, тег `v0.2.0`).

Источник Lens: официальная документация `https://docs.lenshq.io` и release
notes, версия **2026.11.91422-latest** (ноябрь 2026), продукт Mirantis. Lens —
проприетарный преемник открытого Lens; Freelens — форк открытого ядра, а mLens
строился по shell-механикам Freelens и визуальному языку Radar.

Модель Lens: обязательная активация через **Lens ID**, есть **Lens Personal**
(бесплатный план; доступность зависит от условий), **Plus / Pro / Enterprise**
(подписка) и **14-дневный trial**. Часть функций помечена в документации как
premium.

Историю появления фич и момент перехода в premium см. в **§19**.

Обозначения: ✅ есть · 🟡 частично · ❌ нет · 💰 только на платном плане ·
— не применимо.

---

## TL;DR

**mLens уже закрывает базовый бесплатный tier Lens** (виды, таблицы, детали,
логи, терминал, поиск, CRD, namespace, Overview, Related) и в ряде мест даёт
бесплатно то, что у Lens платно (hotbar) или отсутствует/не документировано
(pin колонок, нижний tray вкладок, HPA-guard, Pause/Resume, Set image, Drain,
`?`-оверлей).

**Lens по-прежнему сильнее в платформе:** Helm, Prometheus-метрики и Overview-
графики, продвинутые логи, saved searches, CSV, Applications view, node shell,
resource templates, Gateway/DRA views, split screen и вкладки в окнах,
advanced editor diff, а также весь premium-блок (AI, MCP, GitOps, cost,
security, cloud discovery, Teamwork, extensions).

**Главный вывод:** разрыв сместился. Раньше не было базовых вещей (Set image,
Trigger, Drain, Overview, Related, глобальный поиск). Теперь они есть, и
основные пробелы — **Helm, метрики/Prometheus, продвинутые логи, saved
searches/CSV, Applications, node shell, resource templates, cluster settings**
и платный tier Lens.

---

## 1. Модель продукта, аккаунты, лицензирование

| Фича | Lens | mLens | Комментарий |
|---|---|---|---|
| Лицензия | проприетарная | MIT | |
| Аккаунт | обязателен Lens ID | не нужен | |
| Активация | онлайн/офлайн | не нужна | |
| Бесплатный план | Lens Personal (условно) | — (всё бесплатно) | |
| Платные планы | Plus / Pro / Enterprise | — | |
| Trial | 14 дней | — | |
| SSO/SCIM | 💰 Business ID | ❌ | |
| Seats / billing / AWS Marketplace | 💰 | ❌ | |
| Air-gapped / offline activation | 💰 Enterprise | — | mLens работает офлайн |
| Feature management | 💰 Enterprise | ❌ | |
| Телеметрия | есть | ❌ | |
| Работа без интернета | 🟡 нужна активация | ✅ | |

---

## 2. Оболочка, layout, вкладки, окна

| Фича | Lens | mLens | Комментарий |
|---|---|---|---|
| Одно главное окно | ✅ | ✅ | |
| Tab Bar: вкладки кластеров | ✅ | ✅ | |
| Вкладки открытых ресурсов | ✅ | ✅ | |
| Preview-режим вкладки | ✅ | ❌ | |
| История вкладок back/forward | ✅ | 🟡 back stack, forward disabled | |
| Переключение вкладок Ctrl+number | ✅ | 🟡 | |
| **Сворачивание strip вкладок в нижний shadow tray** | ❌ | ✅ | вкладки остаются кликабельными |
| **Split screen** | 💰 Lens Studio | ❌ | |
| **Tab в отдельном окне** | 💰 Lens Studio | ❌ | |
| Cascade windows | 💰 Lens Studio | ❌ | |
| Hotbar | 💰 12 ячеек, банки | ✅ 10 слотов | mLens бесплатно |
| Dock | ✅ logs/terminal/templates | 🟡 только терминалы | |
| Status bar | ✅ + support chat | ✅ | |
| Title bar: меню/уведомления/история/user menu | ✅ | 🟡 | |
| Onboarding wizard | ✅ | ❌ | |
| Command Palette | ✅ `⌘⇧P` | ✅ `⌘K` + поиск ресурсов | |
| Глобальный поиск ресурсов | ✅ | ✅ | mLens — из палитры, debounce/cap |
| Темы: sync/dark/light | ✅ | ✅ + 3 темы | |
| Кастомные темы | ❌ | ✅ 3 встроенные | |
| Плотность/высота строк | ❌ | ✅ 24–52px | |
| Multi-window без Studio | ❌ | ❌ | |

---

## 3. Кластеры, подключение, cloud, teamwork

| Фича | Lens | mLens | Комментарий |
|---|---|---|---|
| Локальные kubeconfigs | ✅ | ✅ | |
| Импорт/вставка kubeconfig | ✅ | ✅ | |
| Kubeconfig sync из каталогов | ❌ | 🟡 sources | |
| **Авто-обнаружение EKS / AKS / GKE** | 💰 | ❌ | |
| OpenShift cluster | ✅ | 🟡 обычный Kubernetes | |
| Teamwork Spaces / Cluster Connect | 💰 | ❌ | |
| Каталог кластеров с remove/restore | ❌ | ✅ неразрушающий | |
| **Сортировка каталога (Status/Name/Recent/Source)** | 🟡 не документировано | ✅ | |
| **Connected первыми, Status = Connected** | 🟡 | ✅ | версия — отдельная колонка |
| Hotbar | 💰 | ✅ | |
| Cluster tabs / переключение | ✅ | ✅ | |
| Параллельные подключения | ✅ | ✅ | |
| Cluster settings per-cluster | ✅ | 🟡 глобальные | |
| Cluster icon/color | ✅ | 🟡 инициалы | |
| Lens CLI (clusters, tokens, teamwork) | 💰 | ❌ | |

---

## 4. Navigator / sidebar

| Фича | Lens | mLens | Комментарий |
|---|---|---|---|
| Разделы: Kubernetes Clusters, Teamwork, Extensions | ✅ | 🟡 кластеры | |
| Группировка Local / EKS / AKS / GKE | ✅ | ❌ | |
| Дерево ресурсов кластера | ✅ | ✅ | |
| Cluster Overview | ✅ | ✅ | mLens — дефолтный экран после connect |
| Поиск кластера | ✅ `Ctrl+P` | 🟡 палитра | |
| Счётчики ресурсов | ✅ | ✅ | |
| Namespace filter | ✅ | ✅ | |
| Namespace details/add/delete/HNC | ✅ | 🟡 list only | |
| Favorites / pinned | ✅ | ✅ | |
| Перестановка/скрытие разделов | ✅ | 🟡 reorder групп, без hide | |
| RBAC-скрытие недоступного | 🟡 | ❌ | |
| Extensions section | ✅ | ❌ | |
| Device Resources (DRA) | ✅ | 🟡 generic CRD | |
| Flux / Argo / Helm entries | ✅ / 💰 | ❌ (generic CRD) | |
| Sidebar resize | ✅ | ✅ | |

---

## 5. Списки ресурсов и поиск

| Фича | Lens | mLens | Комментарий |
|---|---|---|---|
| Все встроенные виды | ✅ | ✅ | |
| CRD + custom resources | ✅ | ✅ | |
| Printer columns CRD | ✅ | ✅ | |
| Smart-колонки по kind | ✅ | ✅ | |
| Сортировка | ✅ | ✅ | |
| Resize колонок | ✅ | ✅ | |
| Перестановка колонок drag | ✅ | ✅ | |
| **Pin колонок (sticky left)** | ❌ | ✅ | преимущество mLens |
| Скрытие колонок | ✅ | ✅ | |
| Кастомные колонки из label/annotation | ❌ | ❌ | |
| Поиск по списку | ✅ | ✅ | |
| Case-sensitive поиск | ✅ | ❌ | |
| Regex-поиск | ✅ | ✅ | |
| Recent / favorite searches | ✅ | ❌ | |
| Фильтры по значениям колонок | ✅ | ✅ include | |
| Problems-фильтр | ❌ | ✅ | |
| Bulk-выделение/удаление | 🟡 | ✅ | |
| CSV export таблиц | ✅ | ❌ | |
| Virtualized-списки | ✅ | ✅ | |
| Metrics-колонки (CPU/Mem) | ✅ | ✅ | |
| Init containers в таблице | ✅ | ✅ | `+N init` |
| Обновление через watch | ✅ | ✅ | |
| Namespace multi-select | ✅ | ✅ | |
| Row actions «…» | ✅ | ✅ sticky-колонка | |
| Create resource из YAML | ✅ | ✅ dry-run/apply | |
| **Resource templates (22 шаблона)** | ✅ | ❌ | |
| **Диалоги создания (NS/Secret/Quota/RBAC)** | ✅ | ❌ | |
| **CRD naming (kind/apiVersion)** | ✅ | ✅ | |

---

## 6. Детали ресурса и редактор

| Фича | Lens | mLens | Комментарий |
|---|---|---|---|
| Details panel | ✅ | ✅ | |
| Вкладки внутри панели | ❌ (секции) | ✅ 7 вкладок | |
| Copy / Edit / Delete | ✅ | ✅ | |
| **CRD/CR открываются на Details (Freelens order)** | 🟡 | ✅ | |
| **CRD Overview с Radar-карточками, versions, printer columns** | 🟡 | ✅ | |
| **Advanced editor: diff unsaved vs loaded + revert** | 💰 | ❌ | |
| Server-side dry-run | ❌ | ✅ | |
| YAML apply | ✅ | ✅ | |
| Secret values view/edit | ✅ | ✅ | |
| ConfigMap value edit | ✅ | ✅ | |
| TLS certificate details | ✅ | ❌ | |
| Events по объекту | 🟡 | ✅ | |
| Related resources | 🟡 ссылки | ✅ вкладка | |
| Conditions/probes/affinity | ✅ | ✅ | |
| Metrics в деталях | ✅ Prometheus | 🟡 live metrics-server | |
| Force delete | 🟡 | ✅ | |
| Copy kubectl command | ✅ | ✅ | |
| Deep links | ✅ | ❌ | |
| Background click закрывает drawer | ❌? | ✅ | |
| Namespace/Node cell click | ✅? | ✅ | |

---

## 7. Workloads и действия

| Действие | Lens | mLens | Комментарий |
|---|---|---|---|
| Scale | ✅ | ✅ + HPA-guard | |
| Restart | ✅ | ✅ | |
| Pause/Resume rollout | ❌ | ✅ | преимущество mLens |
| Suspend/Resume Job/CronJob | ✅ | ✅ | |
| **CronJob Trigger** | 🟡 | ✅ | |
| **Set image (вкл. init)** | 🟡 | ✅ | |
| **Attach к поду** | 🟡 (shell) | ✅ | |
| Revision history/rollback | 🟡 | ❌ | |
| Node Shell | ✅ | ❌ | |
| Node Cordon/Drain | ✅ | ✅ + live drain plan | |
| Node Edit/Delete | ✅ | ✅ YAML/delete | |
| Pod Shell | ✅ | ✅ | |
| Pod logs | ✅ | ✅ | |
| Port-forward из Pod | ✅ | ✅ | |
| Port-forward из Service/Deployment | 🟡 | ❌ | |
| Argo Rollouts actions | 💰 | ❌ | |
| Workloads overview | ✅ | 🟡 drawer/Cluster Overview | |
| Applications view | ✅ | ❌ | |
| Init containers в Overview | ✅ | ✅ | |

---

## 8. Логи, терминал, dock

| Фича | Lens | mLens | Комментарий |
|---|---|---|---|
| Логи в dock | ✅ | ❌ (в drawer) | |
| Container selector (вкл. init) | ✅ | 🟡 без init | |
| Timestamps | ✅ | ✅ | |
| Previous container | ✅ | ✅ | |
| Word wrap | ✅ | ❌ | |
| Filter logs (toggle) | ✅ | 🟡 только поиск | |
| Show resource names | ✅ | ❌ | |
| Move to controlling resource logs | ✅ | ❌ | |
| Latest event in log | ✅ | ❌ | |
| Download logs | ✅ | 🟡 текущий буфер | |
| Combined/workload logs | ✅ | ❌ | |
| Терминал в dock | ✅ | ✅ | |
| Несколько вкладок терминала | ✅ | ✅ | |
| Dock tabs для logs/edit/templates | ✅ | 🟡 | |
| Terminal font/size/theme | ✅ | 🟡 | |
| Terminal shell path | ✅ | 🟡 `$SHELL` | |
| Copy/paste настройки | ✅ | 🟡 | |
| Log search/next | ✅ | ✅ | |
| Tabs логов/терминала в отдельных окнах | 💰 | ❌ | |

---

## 9. Helm и Port Forwarding

| Фича | Lens | mLens | Комментарий |
|---|---|---|---|
| Helm Charts | ✅ | ❌ | |
| Helm Releases | ✅ | ❌ | |
| Install / Upgrade | ✅ | ❌ | |
| Rollback / history | ✅ | ❌ | |
| Repositories + OCI + storage | ✅ | ❌ | |
| Values editor | ✅ | ❌ | |
| Helm prefs | ✅ | ❌ | |
| Port Forwarding view | ✅ | 🟡 панель | |
| Start/stop/edit forward | ✅ | 🟡 stop | |
| Сохранение форвардов после рестарта | ✅ | ❌ | |
| CSV export | ✅ | ❌ | |
| Port-forward из Pod | ✅ | ✅ | |
| Port-forward из Service/Deployment | 🟡 | ❌ | |

---

## 10. Metrics и Overview

| Фича | Lens | mLens | Комментарий |
|---|---|---|---|
| **Lens Metrics (встроенный Prometheus)** | ✅ | ❌ | |
| **Prometheus providers** | ✅ | ❌ | |
| Prometheus config/query format | ✅ | ❌ | |
| Cluster Overview | ✅ | ✅ | |
| **CPU/Mem/Pods usage, requests, limits, capacity** | ✅ | 🟡 counts + allocatable | |
| **Time range 1h–2 месяца** | ✅ | ❌ | |
| Master/worker разделение | ✅ | ❌ | |
| Issues на Overview | ✅ | 🟡 warning events | |
| Node/Pod/Namespace metrics | ✅ | 🟡 live | |
| Metrics в таблицах | ✅ | ✅ | |
| Metrics в деталях (графики) | ✅ | 🟡 значения | |
| HPA/Ingress/PVC графики | 🟡 | ❌ | |
| metrics.k8s.io | 🟡 | ✅ | |
| Скрытие метрик по типу | 🟡 | ❌ | |
| VictoriaMetrics auto-detect | ✅ | ❌ | |

---

## 11. GitOps, Cost, Security, DRA, Gateway

| Фича | Lens | mLens | Комментарий |
|---|---|---|---|
| Flux CD dashboard + виды + статус на workloads | 💰 | ❌ | |
| Argo CD dashboard + виды + sync/refresh | 💰 | ❌ | |
| Argo Rollouts promote/pause/abort/retry | 💰 | ❌ | |
| Cost Monitoring (24h/7d/30d, idle, efficiency) | 💰 | ❌ | |
| Cost из OpenCost/Kubecost или оценка | 💰 | ❌ | |
| Optimize cost with AI | 💰 | ❌ | |
| Security Center (Trivy): images/resources/roles | 💰 | ❌ | |
| CSV vuln report / air-gapped scan | 💰 | ❌ | |
| Gateway API views | ✅ | 🟡 generic CRD | |
| Device Resources (DRA) 4 вида | ✅ | 🟡 generic CRD | |
| Applications view | ✅ | ❌ | |

---

## 12. AI, MCP, CLI

| Фича | Lens | mLens | Комментарий |
|---|---|---|---|
| Ask AI: AI CLI в терминале с контекстом | 💰 | ❌ | |
| Ask AI actions по ресурсу | 💰 | ❌ | |
| AI control of Lens | 💰 | ❌ | |
| Lens MCP Server | 💰 | ❌ | |
| MCP Kubernetes tools | 💰 | ❌ | |
| MCP Prometheus tools | 💰 | ❌ | |
| MCP Lens tools | 💰 | ❌ | |
| Lens CLI | 💰 | ❌ | |
| REST API | ❌ (MCP/CLI) | ❌ (IPC) | |

---

## 13. Extensions

| Фича | Lens | mLens |
|---|---|---|
| Extension API | ✅ | ❌ |
| Marketplace (npm, `lens-extension`) | ✅ browse free | ❌ |
| Install из marketplace | 💰 | ❌ |
| Local dev extension | 💰 | ❌ |
| Update extensions (auto/hourly) | 💰 | ❌ |
| Compatibility check | ✅ | ❌ |
| Safe mode | ✅ | ❌ |
| Governance | ✅ | ❌ |
| Publish extension | ✅ | ❌ |
| Extension settings/pages/slots | ✅ | ❌ |
| Extension tools в MCP | 💰 | ❌ |

---

## 14. Preferences, темы, клавиатура

| Фича | Lens | mLens | Комментарий |
|---|---|---|---|
| Тема sync/dark/light | ✅ | ✅ | |
| Кастомные темы | ❌ | ✅ 3 встроенные | |
| Accent color | ❌ | ❌ | |
| Start-up at login | ✅ | ❌ | |
| Update channel stable/beta/alpha | ✅ | ❌ | |
| Locale timezone | ✅ | 🟡 системная | |
| Lens CLI toggle | 💰 | — | |
| HTTP Proxy / untrusted CA | ✅ | ❌ | |
| Kubernetes prefs: kubectl, kubeconfig | ✅ | 🟡 sources | |
| Helm prefs: repos/OCI/storage | ✅ | ❌ | |
| Editor prefs | 🟡 | 🟡 Monaco fixed | |
| Terminal prefs | ✅ | 🟡 | |
| Saved/favorite searches | ✅ | ❌ | |
| Shortcuts registry | ✅ | ✅ | |
| `G`-навигация по ресурсам | 🟡 | ✅ | |
| **Оверлей шорткатов `?`** | ❌ | ✅ | преимущество mLens |
| Ремаппинг клавиш | ❌ | ❌ | |
| Command palette | ✅ | ✅ | |

---

## 15. Дистрибуция и безопасность

| Фича | Lens | mLens |
|---|---|---|
| macOS / Windows / Linux | ✅ | ✅ |
| Auto-update + каналы | ✅ | ❌ |
| Homebrew / WinGet / Snap / Flatpak | 🟡 | ❌ |
| Lens CLI в PATH | 💰 | ❌ |
| Air-gapped установка | 💰 | — |
| SBOM / integrity checks | 🟡 | ❌ |
| Sandboxed renderer | ✅ | ✅ |
| Локальные креденшелы не уходят в облако | 🟡 | ✅ |
| Работа без интернета | 🟡 | ✅ |
| Телеметрия | ✅ | ❌ |

---

## 16. Чего у Lens нет, а у mLens есть

1. **Бесплатно и без аккаунта**: Lens требует Lens ID и активацию.
2. **Hotbar бесплатно** (у Lens — premium).
3. **Полностью локальная работа** без облака, телеметрии и активации.
4. **Dracula-тема** и выбор из 3 тем.
5. **Плотность Radar** и высота строк 24–52px.
6. **HPA-guard** при ручном scale.
7. **Pause/Resume rollout** для Deployment.
8. **Вкладки внутри drawer**.
9. **Неразрушающий каталог** кластеров + сортировка Status/Name/Recent/Source.
10. **Regex-поиск + Problems-фильтр**.
11. **Pin колонок** (sticky left) — у Lens нет.
12. **Сворачивание strip вкладок в нижний shadow tray** — у Lens такого нет.
13. **Server-side dry-run** перед apply.
14. **Set image, CronJob Trigger, Drain с live-планом, Attach, Force delete** —
    у Lens часть отсутствует или не документирована.
15. **CRD/CR открываются на Details**, а Overview — Radar-карточки с versions
    и printer columns.
16. **Глобальный поиск ресурсов в палитре + оверлей `?` + `G`-навигация**.
17. **MIT и отсутствие vendor lock-in**; без kubectl/helm-бинарей.
18. **Per-kind глобальные ширины колонок** и порядок, общие для кластеров.
19. **Cluster Overview как дефолтный экран** после подключения.

---

## 17. Приоритеты для mLens (с оглядкой на Lens)

Сначала закрывать **бесплатный tier** Lens, а не гнаться за premium.

### P0 — бесплатные фичи Lens, которых нет

1. **Helm** (charts/releases/install/upgrade/rollback/repos) — главный
   бесплатный пробел.
2. **Saved / recent / favorite searches**, общие для списков и кластеров.
3. **CSV export** таблиц (минимум Nodes/PortForwarding/Security).
4. **Продвинутые логи**: move to controlling resource, show resource names,
   filter toggle, latest event, дата/время, word wrap, download all.
5. **Port-forward из Service/Deployment** + сохранение после рестарта.
6. **Applications view** (labels, managed by, status, violations).
7. **Cluster settings per-cluster**: имя, иконка, kubeconfig, proxy,
   accessible namespaces, terminal working dir/default namespace.
8. **Resource templates** и **диалоги создания** (NS/Secret/Quota/RBAC).
9. **Node Shell**.
10. **Case-sensitive поиск** и подсветка совпадений.
11. **TLS-сертификаты** из Secret (subject/SAN/expiry).
12. **DRA и Gateway API dedicated views** — discovery уже даёт эти виды.
13. **Preview-режим вкладок** и forward-история.

### P1 — крупные бесплатные/условно-бесплатные

14. **Lens-подобный Metrics**: Prometheus-провайдер, графики, time range,
    requests/limits/capacity на Cluster Overview.
15. **Split view** (2 группы вкладок) — у Lens это Lens Studio (premium), но
    mLens может дать бесплатно как преимущество.
16. **Tabs в отдельном окне** — сильный differentiator, если решимся.
17. **Advanced editor**: diff unsaved/loaded + revert (у Lens premium).
18. **Workloads overview** как отдельный экран.
19. **Terminal shell path** и доп. шрифты.
20. **RBAC-скрытие недоступного** через SelfSubjectRulesReview.

### P2 — платный tier Lens (осознанно, не для паритета)

21. **Ask AI** (локальный AI CLI).
22. **MCP Server**.
23. **Flux / Argo CD / Argo Rollouts**.
24. **Cost Monitoring**.
25. **Security Center**.
26. **Cloud discovery** EKS/AKS/GKE.
27. **Teamwork/SSO/SCIM** — противоречит локальной модели mLens.
28. **Extensions marketplace** — сознательно вне scope.

---

## 18. Замечания

1. **Lens сейчас — платный продукт с free-tier Personal.** Hotbar, extensions,
   split view, advanced editor, cloud discovery, GitOps, AI/MCP, cost, security
   и Lens CLI — premium.
2. **Freelens — форк открытого ядра Lens, а не текущего Lens.** Поэтому
   `FREELENS_VS_MLENS.md` и этот файл расходятся: часть фич Freelens в Lens
   платная (Lens Studio, saved searches, CSV, Prometheus).
3. **Lens Tab Bar ≠ вкладки Freelens.** У Lens preview-вкладки и история; у
   Freelens — siblings + drawer. mLens ближе к Freelens, но с отдельными
   cluster tabs и нижним tray.
4. **Lens требует активацию Lens ID даже для бесплатного использования**;
   offline/air-gapped — Enterprise.
5. **Lens использует внутренние прокси и kubectl/helm**, mLens — Kubernetes
   API/WebSocket напрямую. Drain/node shell/Set image в mLens реализованы
   собственными запросами.
6. **Не копировать premium-функции ради галочки.** Ask AI, MCP, Teamwork,
   cloud discovery и Security Center — отдельные подсистемы.
7. **Сравнение обновлено по факту кода v0.2.0**, а не по прошлым планам.

### Что изменилось после v0.2.0

| Было в прошлом сравнении | Стало сейчас |
|---|---|
| Set image ❌ | ✅ Deployment/STS/DS/RS/Job/CronJob, вкл. init |
| CronJob Trigger ❌ | ✅ one-off Job из `jobTemplate` |
| Node drain ❌ | ✅ live-план + Eviction API |
| Pod attach 🟡 | ✅ pods/attach WebSocket |
| Force delete 🟡 | ✅ row menu + диалог |
| Related 🟡 | ✅ вкладка для всех видов |
| Cluster Overview 🟡 | ✅ дефолтный экран после connect |
| Глобальный поиск 🟡 | ✅ из палитры |
| `?` / `G`-навигация ❌ | ✅ |
| Pin колонок ❌ | ✅ sticky left |
| Нижний tray вкладок ❌ | ✅ вкладки остаются кликабельными |
| Сортировка каталога 🟡 | ✅ Status/Name/Recent/Source, Status = Connected |
| CRD Details по умолчанию 🟡 | ✅ + Overview с Radar-карточками |
| Row menu / Node click / init containers 🟡 | ✅ |

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
