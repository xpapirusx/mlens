# Radar → mLens: что есть, чего нет

Сравнение фич **Skyhook Radar 1.8.6** (эталон, см. `RADAR_FEATURES.md`) и
**mLens 0.1.0** (этот репозиторий). Проверялось по коду mLens и по его
`AGENTS.md` / `DESIGN_SPEC.md` / `ARCHITECTURE.md` / `IMPLEMENTATION_PLAN.md`.

Обозначения: ✅ есть · 🟡 частично · ❌ нет · — не применимо к desktop-модели.
Пометка **(в работе)** — фича есть только в незакоммиченных изменениях рабочего
дерева (`git status`); в `HEAD` её нет.

---

## TL;DR

**mLens сильнее Radar в оболочке:** мультикластерность, вкладки кластеров,
hotbar, каталог кластеров, импорт kubeconfig вставкой, сохранение состояния
кластера при переключении, 3 темы, настройка высоты строк, per-kind widths.

**Radar сильнее mLens в диагностике и экосистеме:** Issues, Topology, Timeline,
Helm, GitOps, Traffic, Prometheus-графики и history, rightsizing, Capacity,
Cost, Audit, Upgrade impact, Reachability, TLS, Image FS, Pod files, Compare,
RBAC-эффективные права, node drain/terminal, workload logs, custom columns,
MCP/AI.

В цифрах: у Radar ~17 маршрутов и 12 разделов навигации; у mLens из крупных
экранов реализованы только Resources и Details (+ начатый Overview). При этом
базовый браузер ресурсов mLens функционально близок к Radar. Часть
Home-дашборда уже начата — см. §13.

---

## 1. Оболочка и кластеры

| Фича | Radar | mLens | Комментарий |
|---|---|---|---|
| Одно окно десктопа | ✅ Wails | ✅ Electron | разные технологии, UX похож |
| Мультикластерность одновременно | ❌ один контекст за раз | ✅ | mLens: изолированные сессии в main |
| Вкладки открытых кластеров | ❌ | ✅ | Freelens-механика |
| Hotbar (10 слотов, drag) | ❌ | ✅ | |
| Каталог кластеров + welcome | ❌ | ✅ | |
| Импорт kubeconfig файлом | 🟡 `--kubeconfig-dir` | ✅ | |
| Импорт kubeconfig вставкой YAML | ❌ | ✅ | |
| Favourites / recents / removed+restore | ❌ | ✅ | |
| Health, latency, версия, API server | 🟡 health в шапке | ✅ | |
| Переключатель контекста | ✅ + подтверждение при живых сессиях | ✅ (каталог/вкладки) | |
| Namespace multi-select | ✅ | ✅ | |
| Large-cluster namespace picker | ✅ | ❌ | |
| Namespace scope pill | ✅ | 🟡 (в toolbar) | |
| Сохранение состояния при switch | 🟡 per-cluster view memory | ✅ полностью (scroll, drawer, PTY) | mLens лучше |
| Command palette `⌘K` | ✅ богаче (серверный поиск, секции) | ✅ | |
| Глобальный поиск по ресурсам с синтаксисом | ✅ `ns:`/`kind:`/`label:`/`image:` | ❌ | |
| `g`+letter навигация | ✅ | ❌ | |
| Оверлей всех шорткатов `?` | ✅ | ❌ | |
| URL как состояние / deep links | ✅ | — | desktop |
| Phone layout | ✅ (6 экранов) | — | |
| Dock | ✅ логи + терминалы + traffic | 🟡 только терминалы | |
| Статус-бар | ❌ | ✅ | |
| About / What's New / update check | ✅ | 🟡 About в настройках | |
| Usage telemetry (opt-in) | ✅ | ❌ (и не нужен) | |
| Настройки: Connection/Metrics/Cost/Argo/AI | ✅ | 🟡 Appearance/refresh/terminal/sources/clusters | |
| CAPI connect | ✅ | ❌ | |
| Base path / ingress hosting | ✅ | — | |

---

## 2. Home / обзор кластера

| Фича | Radar | mLens |
|---|---|---|
| Cluster Overview в сайдбаре (счётчики Pods/Deployments/NS/Services, ноды Ready, CPU/Mem allocatable, warning events, API kinds, CRD count, контекст) | ✅ | 🟡 (в работе): `features/overview/ClusterOverview.tsx`, пункт «Overview» в сайдбаре |
| Health ring / оценка здоровья | ✅ | ❌ |
| Problems panel «что сломано» на главной | ✅ | ❌ |
| Activity summary | ✅ | ❌ |
| Topology preview | ✅ | ❌ |
| Helm / GitOps / Cost / Capacity / Traffic карточки | ✅ | ❌ |
| Certificate health | ✅ | ❌ |
| NetworkPolicy coverage | ✅ | ❌ |
| Блок MCP/AI и каталог инструментов | ✅ | ❌ |
| Каталог кластеров как домашний экран | ❌ | ✅ |

---

## 3. Браузер ресурсов

| Фича | Radar | mLens | Комментарий |
|---|---|---|---|
| Все виды + CRD через discovery | ✅ | ✅ | |
| Smart-колонки по kind | ✅ | ✅ | |
| **Кастомные колонки из label/annotation** | ✅ | ❌ | заметная фича Radar |
| Printer columns CRD | ✅ | ✅ | |
| Поиск | ✅ с синтаксисом | ✅ | |
| Regex-поиск | ✅ | ✅ | |
| Фильтры по значениям колонок | ✅ include + **exclude** | 🟡 только include | |
| Отдельный фильтр по label | ✅ | ❌ | |
| Problems-фильтр | ✅ (9 категорий) | 🟡 | mLens — только текущий kind |
| Сортировка + сохранение | ✅ | ✅ | |
| Resize колонок | ✅ | ✅ | |
| Скрытие колонок | ✅ | ✅ | |
| Порядок колонок | ✅ | ✅ | |
| **Закрепление (pin) колонок** | ✅ | ❌ | |
| Глобальные ширины per kind+column | 🟡 | ✅ | mLens persist across clusters |
| Namespace scope all/one/several | ✅ | ✅ | |
| Пагинация больших списков | ✅ informer-кэш + `--list-page-size` | ✅ continue + Load more | |
| Live-обновления | ✅ SSE | ✅ watch | разные транспорты |
| Индикатор свежести | ✅ | ✅ | |
| Bulk-выбор | ✅ | ✅ | |
| Bulk-действия | ✅ delete / restart / scale | 🟡 только delete | |
| CRD schema search / browser | ✅ | ❌ | |
| Set image (в т.ч. init) | ✅ | ❌ | |
| Rollout progress UI | ✅ | 🟡 статус и conditions |
| Compare двух ресурсов | ✅ | ❌ | |
| Copy name / copy kubectl | ✅ | 🟡 copy kubectl |
| Create/Apply YAML с dry-run | ✅ + drag-drop файлов | ✅ |
| Каскадный предпросмотр удаления | ✅ | ❌ | mLens: простое подтверждение |
| Force delete (`--grace-period=0`) | ✅ | ✅ (в работе): row menu + диалог + проброс в main |
| YAML schema/autocomplete | ✅ OpenAPI кластера | ❌ | |
| Cordon/uncordon Node | ✅ | 🟡 (в работе): AGENTS.md уже описывает; кнопки в drawer/row menu |
| Drain Node с планом | ✅ | ❌ | |
| Node debug pod | ✅ | ❌ | |
| Pod file browser (list/preview/upload) | ✅ | ❌ | |
| Image filesystem viewer | ✅ | ❌ | |
| Auto port-forward для интеграций | ✅ | — | |

---

## 4. Детали ресурса

Вкладки Radar: **Overview, Spec & status, Topology, Timeline, Logs, Metrics,
Reachability, Cost, YAML**.

| Фича | Radar | mLens | Комментарий |
|---|---|---|---|
| Правый drawer, resizable/expand | ✅ | ✅ | |
| Вкладки | ✅ 9 | ✅ 7: Overview/Details/YAML/Events/Related/Logs/Metrics | у mLens нет Topology/Timeline/Reachability/Cost-вкладок |
| Full-page detail route `/workload/<kind>/<ns>/<name>` | ✅ | ❌ только drawer | |
| Related / ownership | ✅ | 🟡 (в работе): AGENTS.md уже описывает вкладку; в `HEAD` её нет |
| Events | ✅ | ✅ | |
| Problems в drawer с evidence | ✅ | 🟡 (status/conditions) | |
| Env-ссылки с reveal | ✅ RBAC-gated | ✅ | |
| Secret: значения | ❌ скрыты (есть только env reveal) | ✅ decode/edit | mLens даёт больше |
| ConfigMap/Secret key-value editor | 🟡 YAML | ✅ | |
| TLS-сертификат из Secret | ✅ | ❌ | |
| Reflector-связи | ✅ | ❌ | |
| HPA charts + 14-state diagnosis | ✅ | ❌ | |
| Prometheus-графики | ✅ | ❌ | |
| Rightsizing (requests/limits) | ✅ | ❌ | |
| PVC usage bar | ✅ | ❌ | |
| Restart chart | ✅ | ❌ | |
| Метрики Pod | ✅ + history | 🟡 live metrics-server |
| Метрики workload (RPS/errors/latency) | ✅ | ❌ | |
| Conditions/probes/affinity/volumes | ✅ | ✅ | |
| Cert-manager / Gateway / Istio / Knative evidence | ✅ | ❌ | mLens: generic CRD |
| GitOps write guard | ✅ | ❌ | |
| Investigate (AI) из ресурса | ✅ | ❌ | |
| Deep link `?resource=…&full=1&tab=yaml` | ✅ | — | desktop |

---

## 5. Действия над workload

| Действие | Radar | mLens | Комментарий |
|---|---|---|---|
| Scale | ✅ 0–10000, bulk | ✅ | + HPA-guard у mLens |
| Restart | ✅ bulk | ✅ | |
| Pause/Resume rollout | ✅ | ✅ | Deployment |
| Suspend/Resume | ✅ Job/CronJob/Flux/Argo | ✅ Job/CronJob | |
| Set image | ✅ | ❌ | |
| Revision history + rollback | ✅ | ❌ | в планах mLens |
| CronJob Trigger | ✅ | ❌ | в планах mLens |
| Argo Rollouts actions | ✅ | ❌ | |
| GitOps sync/suspend/resume/rollback | ✅ | ❌ | |
| Delete force/cascade preview | ✅ | 🟡 (в работе): force delete готов (меню + диалог), каскадного плана нет |
| Node cordon/uncordon | ✅ | 🟡 (в работе) | |
| Node drain | ✅ | ❌ | |
| Node terminal | ✅ | ❌ | |
| Pod debug/ephemeral container | ✅ | ❌ | attach-режим в работе как задел |
| Copy kubectl/port-forward команды | ✅ | 🟡 kubectl | |

---

## 6. Диагностика и отдельные экраны

| Экран | Radar | mLens |
|---|---|---|
| Issues (ранжированная очередь, severity, taxonomy, dedupe) | ✅ | ❌ |
| Topology (graph, 2 режима, grouping, CAPI fleet) | ✅ | ❌ |
| Timeline (List + Swimlanes, diffs, scrubber, SQLite/PG) | ✅ | ❌ |
| Helm (releases, values diff, upgrade/rollback/uninstall, repos/OCI, Artifact Hub) | ✅ | ❌ |
| GitOps (Argo/Flux fleet + diagnosis + actions) | ✅ | ❌ (CRD как generic) |
| Applications view | ✅ | ❌ |
| Packages API | ✅ | ❌ |
| Traffic (Hubble/Istio/Caretta/Beyla) | ✅ | ❌ |
| Cost (OpenCost/Kubecost) | ✅ | ❌ |
| Capacity (Karpenter + scheduling card) | ✅ | ❌ |
| Cluster Audit (~48 checks) | ✅ | ❌ |
| Upgrade impact | ✅ | ❌ |
| Reachability / network path | ✅ | ❌ |
| NetworkPolicy evaluation | ✅ | ❌ |
| TLS certificate management | ✅ | ❌ |
| Image filesystem viewer | ✅ | ❌ |
| Compare (+ Helm compare) | ✅ | ❌ |
| CNPG workspace | ✅ | ❌ |
| Kueue / Kyverno / Trivy views | ✅ | ❌ |
| Batch execution / JobSet | ✅ | ❌ |
| Curl service | ✅ | ❌ |

---

## 7. Логи, терминал, порты

| Фича | Radar | mLens | Комментарий |
|---|---|---|---|
| Локальный PTY | ✅ | ✅ | |
| Pod exec через WebSocket | ✅ | ✅ | |
| Shell cascade bash→ash→sh | ✅ | 🟡 `/bin/sh` |
| Несколько вкладок терминала | ✅ | ✅ | |
| Resize TTY | ✅ | ✅ | |
| Терминал ноды | ✅ | ❌ | |
| Поиск в терминале | ✅ | ✅ | |
| Copy-on-select / clipboard toolbar | ✅ | 🟡 | |
| Выбор контейнера для exec | ✅ | 🟡 | UI берёт первый контейнер; attach-режим в работе |
| Streaming logs | ✅ SSE | ✅ | |
| Container picker в логах | ✅ вкл. init | 🟡 без init | |
| Follow / previous / timestamps / tail | ✅ 6 форматов времени | ✅ | |
| Structured JSON logs + level-фильтр | ✅ | ❌ | |
| Поиск в логах | ✅ case/regex | ✅ | |
| Export логов | ✅ txt/JSON/CSV | 🟡 txt download |
| Workload logs (агрегация подов) | ✅ | ❌ | |
| JobSet/Ray/CNPG logs | ✅ | ❌ | |
| Логи в нижнем dock | ✅ | ❌ | mLens: вкладка в drawer |
| Port-forward | ✅ pod/service/deployment | 🟡 только Pod | |
| Панель активных форвардов | ✅ retry/stop/minimize | ✅ | |
| Один клик из Ports | ✅ | ✅ | |
| Auto port-forward | ✅ | — | |
| UDP / multi-port | ❌ | ❌ | |
| Session recording/replay | ❌ | ❌ | |

---

## 8. RBAC, безопасность, доступ

| Фича | Radar | mLens | Комментарий |
|---|---|---|---|
| Просмотр Role/Binding/SA | ✅ | ✅ | как обычные ресурсы |
| Эффективные права SA + обратный lookup | ✅ | ❌ | |
| Blast-radius предупреждения | ✅ | ❌ | |
| My Permissions (SelfSubjectRulesReview) | ✅ | ❌ | |
| Capability-aware UI (скрытие кнопок по RBAC) | ✅ | ❌ | mLens: ошибка сервера |
| Auth proxy / OIDC / SSO | ✅ | — | desktop-модель |
| Per-user impersonation | ✅ | — | |
| Session cookies / revocation | ✅ | — | |
| Secret-значения скрыты | ✅ | 🟡 reveal по кнопке | |
| Env reveal RBAC-gated | ✅ | 🟡 (без SSAR) | |
| Скрабинг секретов в логах/MCP/Helm | ✅ | ❌ | |
| Audit-лог сервера | ✅ (stdout) | ❌ | |
| Read coverage honesty (gaps, narrowed-by) | ✅ | 🟡 ошибки показываются |

---

## 9. AI и автоматизация

| Фича | Radar | mLens |
|---|---|---|
| MCP-сервер | ✅ 4 endpoint'а (`/mcp`, `/mcp-readonly`, `/mcp-apply`, `/mcp-investigation`) | ❌ |
| ~40 MCP-инструментов + MCP resources | ✅ | ❌ |
| AI investigations через локальный агент | ✅ 4 CLI | ❌ |
| `radar diagnose` CLI | ✅ | ❌ |
| `radar probe` CLI (DNS/TCP/TLS/HTTP) | ✅ | ❌ |
| REST API + SSE | ✅ ~330 маршрутов | ❌ (IPC only) |
| Плагины / extension API | ❌ | ❌ |
| Встраивание UI в чужой хост | ✅ npm-пакет | ❌ |

---

## 10. Распространение и режимы

| Фича | Radar | mLens |
|---|---|---|
| Desktop-приложение | ✅ Wails | ✅ Electron |
| Один бинарник / серверный режим | ✅ | ❌ |
| `kubectl`-плагин / Krew | ✅ | ❌ |
| Homebrew / Scoop / PowerShell | ✅ | ❌ |
| In-cluster Helm для команды | ✅ | ❌ |
| Docker-образ | ✅ | ❌ |
| Demo/testserver | ✅ | ❌ |
| Self-update | ✅ | ❌ |
| Мультиоконность | ❌ | ❌ |
| Тёмная/светлая тема | ✅ | ✅ + Dracula/Freelens |
| Настройка высоты строк таблицы | ❌ | ✅ |
| Терминальные палитры по темам | 🟡 | ✅ |
| Ремаппинг клавиш | ❌ | ❌ |

---

## 11. Чего у Radar нет, а у mLens есть

Это не «долги», а реальные преимущества, которые стоит сохранять:

1. **Мультикластерный desktop-shell**: вкладки кластеров, hotbar, каталог,
   параллельные сессии, сохранение живых PTY при переключении.
2. **Каталог кластеров с неразрушающим удалением и restore** — kubeconfig не
   трогается.
3. **Импорт kubeconfig вставкой YAML** (Radar работает только с файлами/диром).
4. **Desktop-first**: не нужен HTTP-сервер и браузер.
5. **Вкладки открытых ресурсов** (у Radar detail — drawer/page без tab-strip).
6. **Редактор ConfigMap/Secret** с transparent base64 и merge patch (Radar
   значения Secret не показывает вообще — осознанно, но mLens функциональнее
   для локального пользователя).
7. **Per-kind глобальные ширины колонок** и настраиваемая высота строк.
8. **3 темы** (Radar light/dark, Dracula, Freelens) с согласованными
   Monaco/xterm палитрами.
9. **HPA-guard при ручном scale** (ленивая проверка на нажатие).
10. **Статус-бар** и более простая модель «без сервера».
11. **Понятный честный UX при отсутствии metrics API** (`–`, «not installed»)
    — совпадает с философией Radar.

---

## 12. Приоритеты для mLens (что даёт максимум)

Порядок — по соотношению «ценность / стоимость» для текущей архитектуры.

### P0 — дешёвые доборы в существующем UI

1. **Set image** для Deployment/StatefulSet/DaemonSet (JSON/merge patch
   `spec.template.spec.containers[].image`) — данные уже есть.
2. **Revision history + rollback** через ReplicaSets с
   `deployment.kubernetes.io/revision`.
3. **CronJob Trigger** — создать Job из `jobTemplate`.
4. **Init-контейнеры в логах** — picker сейчас берёт только `spec.containers`.
5. **Выбор контейнера для exec** (сейчас первый; attach-режим уже начат).
6. **Pin колонок**, **exclude-фильтры**, **фильтр по label**.
7. **Bulk restart/scale** по аналогии с bulk delete.
8. **Кастомные колонки из label/annotation** — данные уже в объектах.
9. **Node drain** с планом (cordon/uncordon уже в работе; нужны eviction +
   PDB-проверки).
10. **SelfSubjectRulesReview / SelfSubjectAccessReview** — capability-aware UI,
    убирает ошибки 403.
11. **Workload logs** — агрегировать логи по селектору workload в dock-вкладку.
12. **Compare** — diff двух YAML, дёшево и полезно.
13. **Force delete** (уже начат) + каскадный предпросмотр удаления.

### P1 — крупные экраны на уже готовом data-layer

14. **Topology** — owner refs, selectors, volumes, env refs уже резолвятся;
    граф можно начать без ELK.
15. **Timeline** — watch-поток есть; писать изменения в SQLite/JSON, показывать
    diffs.
16. **Helm** — парсинг Secret `sh.helm.release.v1.*`, список релизов, values,
    rollback.
17. **Prometheus-графики + history** (URL в настройках) + **rightsizing**.
18. **Issues** — поверх status/event/owner-данных (crash loop, image pull,
    unschedulable, dangling refs).
19. **TLS-сертификаты** — парсинг `tls.crt` (x509 в Node).
20. **GitOps** — Argo/Flux CRD уже видны; нужны renderers и actions.
21. **Audit** — набор проверок на кэше ресурсов, без установки в кластер.
22. **NetworkPolicy evaluation / Reachability** — netpol-правила и hop-диагноз.

### P2 — отдельные подсистемы

23. **Traffic** — требует Hubble/Istio/Beyla, самый дорогой пункт.
24. **Cost** — OpenCost/Prometheus.
25. **Capacity (Karpenter)** + scheduling card.
26. **Image filesystem / Pod file browser** — реестры, pull secrets, слои.
27. **Applications / Packages** — группировка workload по image.
28. **CNPG / Kueue / Kyverno / Trivy** — dedicated views.
29. **MCP-сервер** — отдельный процесс/порт; архитектурно конфликтует с
    «no server», решать осознанно.
30. **AI investigations** — только после MCP/локального агента.

---

## 13. Что уже в работе (незакоммиченные изменения)

По `git status` в рабочем дереве уже начаты (в `HEAD` этого нет):

- **Cluster Overview** — `features/overview/ClusterOverview.tsx` + пункт
  «Overview» в сайдбаре (счётчики, ноды Ready, CPU/Mem allocatable, warning
  events, API kinds, CRDs, контекст).
- **Related-вкладка** возвращена в drawer. **AGENTS.md уже описывает её** как
  штатную (Overview / Details / YAML / Events / Related / Logs / Metrics).
- **Cordon/Uncordon** в row menu и drawer; AGENTS.md уже описывает
  Cordon/Uncordon для Nodes и новое расположение действий (иконки в шапке
  drawer, Delete рядом с Close, Reload vs Restart).
- **Force delete** (`gracePeriodSeconds: 0`) — backend + row menu + диалог.
- **Attach-режим exec** (`Attach` вместо `Exec`) — задел под подключение к
  запущенному процессу/контейнеру.
- **Колонка действий «…»** в каждой строке таблицы, клик по фону для снятия
  выделения, переход на Node из таблицы.
- **Init-контейнеры** в Overview с бейджем `init`, requests/limits, портами.
- CRD в сайдбаре: `kind:` + `apiVersion:` в две строки.
- Прочие правки `OverviewTab`, `TerminalView`, `columns.tsx`, `session-store`.

Эти пункты в таблицах выше помечены **(в работе)** и не должны считаться
готовыми, пока не закоммичены и не проверены на реальном кластере. AGENTS.md
уже фиксирует часть из них как целевое поведение — значит, после коммита нужно
синхронизировать остальные документы.

---

## 14. Замечания к документации mLens

1. **Related-вкладка.** `AGENTS.md` уже включает Related в список вкладок, а
   `DESIGN_SPEC.md` §2.7 и `PROJECT_CONTEXT.md` §8 всё ещё утверждают, что
   вкладка удалена, а резолвер не используется. Код в рабочем дереве её
   рендерит. Нужно привести три документа к одному состоянию после коммита.
2. **Cordon/Uncordon.** AGENTS.md описывает, в `DESIGN_SPEC.md` и
   `IMPLEMENTATION_PLAN.md` — нет. Drain отсутствует, это стоит указать явно.
3. **Действия в шапке drawer.** AGENTS.md теперь описывает иконки
   Logs/Exec/Forward/Scale/Restart/Pause/Resume/Cordon/Delete и разделение
   Reload vs Restart; `DESIGN_SPEC.md` §2.7 всё ещё описывает текстовый
   action-row под заголовком. Синхронизировать.
4. **CPU/Memory колонки.** `IMPLEMENTATION_PLAN.md` одновременно помечает
   «Table CPU/memory columns from metrics-server» как not started (Stage 5) и
   как Done (Stage 4) + Pass в verification log. Противоречие.
5. **Бэклог Radar-действий.** `PROJECT_CONTEXT.md` §8 перечисляет revision
   history/rollback, Set image, CronJob Trigger, Argo/Flux — их действительно
   нет; сверка это подтверждает.
6. **«Logs are Pod-only».** Соблюдается в drawer, но init-контейнеры в picker
   не попадают. Если правило осознанное — записать; если нет — это баг.
7. **Force delete / attach.** Force delete подключён в UI, но не описан в
   документации; attach-режим exec реализован в main, но ещё не используется
   из UI. После подключения — задокументировать.
