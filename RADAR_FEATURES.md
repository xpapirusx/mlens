# Radar — инвентаризация фич

Источник: `/Users/levins/Projects/radar`, ветка `main`, коммит `2280c2803`,
версия `1.8.6`, лицензия Apache-2.0. Это **обзор возможностей продукта**, не
оценка кода: цель — эталонный список функций Radar, с которым сравнивается
mLens (см. `RADAR_VS_MLENS.md`).

Масштаб для ориентира: 58 пакетов `internal/`, 56 пакетов `pkg/`, ~330
REST-маршрутов, 32 feature-папки в `web/src/components`, ~205 React Query
хуков, 40 MCP-инструментов.

Кратко: Radar — Go-бинарник (один файл) со встроенным React-фронтендом, который
отдаёт веб-UI, REST API, SSE-поток и MCP-сервер. Запускается локально как
`kubectl`-плагин, настольное приложение (Wails) или in-cluster через Helm.

---

## 1. Подключение, kubeconfig, auth, discovery

| Фича | Что делает | Подтверждение |
|---|---|---|
| Подключение по kubeconfig без агентов/CRD | Ходит в API server с вашими правами | `internal/k8s/client.go` |
| Несколько kubeconfig-источников | `--kubeconfig`, `--kubeconfig-dir` (несколько каталогов), merge контекстов | `cmd/explorer/main.go`, `internal/k8s/context_manager.go` |
| Переключатель контекста | Поиск, группировка по источнику kubeconfig, multi-account заголовки | `web/src/components/ContextSwitcher.tsx` |
| Подтверждение смены контекста при живых сессиях | `/api/sessions` показывает активные терминалы и port-forward | `internal/server/server.go` |
| Прогресс и экран ошибки переключения | Сообщения стадий, «Failed to switch», возврат к прошлому кластеру | `SyncProgressPanel.tsx`, `SwitchAwareConnectionError.tsx` |
| `exec` credential plugins | OIDC/GCP/Azure и любые client-go плагины | `docs/configuration.md` |
| UX истёкших креденшелов | Текст под GKE/EKS/AKS, копируемая команда повторного логина, «Run in Terminal» | `ConnectionErrorView.tsx` |
| Retry / disconnect / reconnect | Явные состояния, баннер переподключения | `/api/connection`, `ConnectionContext.tsx` |
| Discovery всех видов, включая CRD | `/api`, `/apis`, CRD list; никакого закрытого списка | `internal/k8s/discovery.go` |
| RBAC-probe возможностей | Реальные LIST-пробы: cluster-wide / namespaced / disabled по kind | `internal/k8s/capabilities.go` |
| Namespace-ограниченные пользователи | `--namespaces`, `--namespace-scope`, fallback-обнаружение namespace | `docs/authentication.md` |
| Connect к Cluster API кластеру | Подключение по сгенерированному kubeconfig CAPI-кластера | `/api/capi/clusters/...` |
| Определение облака | GKE/EKS/AKS: подсказки, disk checks | `internal/k8s/cluster_detection.go` |
| Air-gapped / private registry | `--debug-image`, `--reachability-image` | `cmd/explorer/main.go` |
| Хостинг под base path / ingress | `--base-path`, `--allowed-hosts`, `--trusted-origins`, listen address | `internal/server/server.go` |
| Проверка версии | `/api/version-check`, `--no-version-check` | `internal/server/version_check.go` |

---

## 2. Оболочка и навигация

- **Primary nav rail** — 12 разделов: Home, Issues, Resources, Topology,
  Timeline, Helm, GitOps, Applications, Traffic, Cost, Checks, Capacity
  (+ CNPG при наличии оператора). Сворачивается/закрепляется, есть fly-out
  подписи, принудительно slim на узком окне.
  `web/src/components/nav/PrimaryNavRail.tsx`
- **Верхняя панель**: context switcher, namespace switcher (+ scope pill),
  omnibar, тема, помощь, диагностика, user menu, индикатор port-forward,
  Radar Cloud.
- **URL как состояние**: вид, kind, namespace, фильтры, `?resource=`,
  `?release=`, `?app=`, `?full=1`, `?tab=`, `?ai-run=` → deep links и
  shareable-ссылки. `web/src/App.tsx`
- **Память разделов и фильтров** по кластеру: последний путь раздела и
  последний kind в Resources. `utils/viewMemory.ts`, `utils/kindFilterStore.ts`
- **Нижний dock**: вкладки логов пода, агрегированных логов workload,
  локального терминала, терминала ноды, списка traffic-потоков; настройки
  терминала; toggle `Ctrl+`` / `Cmd+J`.
  `web/src/components/dock/*`
- **Details drawer**: боковая панель, разворачивается на весь экран, работает
  поверх любого вида, на телефоне всегда fullscreen, Back сворачивает
  развёрнутый drawer.
- **Omnibar / командная палитра** `⌘K`: серверный поиск ресурсов + Views,
  Resource Kinds, Clusters, Namespaces, Actions, недавние ресурсы.
- **Справка по клавишам** `?`, What's New, About, уведомление об обновлении,
  согласие на usage-data, diagnostics overlay (`Ctrl+Shift+D`).
- **Темы**: light/dark, стартует от системной, `t` переключает.
- **Phone layout** для Issues, Resources, Helm, Home, Topology, Capacity.
- **Честные контролы**: namespace-фильтр отключается с объяснением на
  cluster-scoped экранах; при недоступных данных показывается причина.

---

## 3. Home (обзор кластера)

- Health ring и карточка здоровья кластера.
- Problems panel (что сломано сейчас) с переходом в Issues.
- Activity summary, Topology preview.
- Helm summary, GitOps controllers card.
- Certificate health (истекающие TLS-сертификаты).
- Capacity card (Karpenter), Cost card, Traffic summary.
- NetworkPolicy coverage card.
- Блок AI/MCP: статус, настройка, каталог MCP-инструментов.
- Version line, Product Hunt notice, GitHub star ask.
  `web/src/components/home/*`

---

## 4. Resources: таблица, колонки, фильтры, поиск, namespace

- Все виды и CRD; маршрут `/resources/<kind>`, дефолт — Pods.
- Sidebar: категории Workloads / Networking / Configuration / Storage /
  Access Control / Cluster + группа на каждый CRD API group.
- **Favorites (pinned kinds)**, фильтр kinds, показ/скрытие пустых kinds,
  счётчики с «≥» для частичного RBAC.
- **Smart-колонки по kind** + ~40 curated интеграций.
- **CRD printer columns** (`additionalPrinterColumns`) для некурируемых CRD.
- **Кастомные колонки из любого label/annotation** — сортируемые, фильтруемые,
  с черновиком и удалением.
- Колонки: show/hide, порядок drag, Alt+↑/↓, **pin**, resize (мин. 72px),
  сохранение per `apiVersion|kind`.
- **Фильтры колонок include/exclude** по distinct-значениям, сериализуются в
  URL. Отдельный **фильтр по label**.
- **Problems-фильтр**: CrashLoopBackOff, ImagePullBackOff, OOMKilled,
  Unschedulable, Not Ready, High Restarts, Init Failed, Exit Code Error,
  Failed, Other.
- **Поиск с синтаксисом**: `ns:`, `kind:`/`k:`, `label:`/`l:`, `image:`/`img:`,
  `cluster:`/`c:`, кавычки, IP/IP:port, AND-токены; подсказка синтаксиса.
- Active filter bar с очисткой; сортировка `N`/`A`/`S`, сохранение сортировки.
- **Bulk select + bulk delete / restart / scale**, force-delete, `b` —
  переключить чекбоксы; row hover actions; copy name.
- Live-обновления через SSE (3s/15s), пауза на скрытой вкладке; индикатор
  свежести с ручным refresh.
- **Namespace multi-select**, `[]` = все; запоминание выбора; отдельный
  large-cluster picker, когда список namespace медленный/запрещён.
- Virtualized rows, горизонтальный скролл, широкий drawer для Trivy/RBAC.
- Create resource для текущего kind; **compare mode** из таблицы (две строки
  одного kind).
- Phone layout.

---

## 5. Детали ресурса

Drawer с вкладками **Overview, Spec & status, Topology, Timeline, Logs,
Metrics, Reachability, Cost, YAML**; отдельный full-page маршрут
`/workload/<kind>/<ns>/<name>`.

- **100+ рендереров** по kind и интеграциям (containers, env, probes,
  conditions, selectors, replicas, CNPG, Karpenter, Crossplane, Kyverno,
  Velero и т.д.).
- **Related / ownership**: owners, children, старые ревизии, deployment
  grandparent, config, network, scalers, policies, storage; «Managed by» /
  «Manages».
- **Problems в drawer** с указанием источника evidence.
- **YAML (Monaco)**: подсветка, **OpenAPI-схема подключённого кластера**,
  copy, download.
- **YAML edit + save**: server-side dry-run preview, conflict detection по
  `resourceVersion`, force replace.
- **Apply**: multi-doc, `List`, drag-drop YAML-файлов.
- **Delete с cascade preview**: наблюдаемые dependents garbage collection +
  GitOps cleanup, force-опция.
- Actions по kind: restart, scale (0–10000), pause/resume rollout,
  suspend/resume (Job/CronJob/Flux/Argo), **CronJob Trigger now**,
  **revisions + rollback** (Deployment/StatefulSet/DaemonSet/Rollout),
  **Set image** (обычные и init-контейнеры, CAS-патч + прогресс rollout).
- **Node**: cordon/uncordon, **drain с планом** (evict/skip/may-block, ожидание
  PDB, live-статус), **debug pod**, сертификаты, GPU/disk facts.
- **Pod**: debug/ephemeral container, env reveal (RBAC-gated), файловый браузер
  (list/preview/download/upload), image filesystem.
- **GitOps write guard**: предупреждение перед правкой поля, которым управляет
  Argo/Flux (last-applied, field managers, риск revert).
- Copy: name, YAML, kubectl-команда (в т.ч. `kubectl logs job/... -f`).
- Deep links `?resource=ns/name&full=1&tab=yaml`.
- **Secret values не рендерятся**: только имена/ключи; `.data` не отдаётся.

---

## 6. Issues (что сломано)

- Ранжированная очередь проблем с severity (critical/alert/warning/info),
  группировкой по subject, dedupe, grace-периодами.
- Таксономия: CrashLoop, ImagePull, Unschedulable, QuotaExceeded,
  PodSecurityViolation, AdmissionWebhookBlocking, RBACForbidden,
  VolumeMountFailed, Ingress backend missing, Gateway route invalid, webhook
  backend down, условия GitOps, Helm, CNPG, cert-manager, Flagger, Karpenter,
  Kueue, Velero, Strimzi, OTel.
- Warning-события становятся Issues с контекстом admission/backoff.
- Кнопка **Investigate** на каждой проблеме.
- «Unchecked sources»: честно перечисляет, что не удалось проверить.
  `internal/issues/` (~80 файлов), `web/src/components/issues/*`, `pkg/issuesapi`

---

## 7. Topology (граф)

- Интерактивный граф связей в реальном времени (SSE).
- Режимы **Resources** и **Traffic**; группировка namespace / app label / none.
- Фильтр по kind, поиск и фокус, breadcrumb, зум (`+`/`-`/`0`), fit (`f`),
  pause live-update.
- Авто-раскладка ELK.js, pod grouping/collapsing, подсветка проблем и audit,
  policy-effect overlay.
- Fleet-режим Cluster API (CAPI): cluster/machine/control-plane провайдеры.
- Focus сохраняется в URL; клик по узлу открывает детали.
  `packages/k8s-ui/src/components/topology/`, `pkg/topology/`

---

## 8. Timeline (история)

- Единая лента K8s-событий и изменений ресурсов с field-level diff.
- Два режима: **List** и **Swimlanes** (дорожки по owner/app/иерархии,
  авто-раскрытие проблемных, pin дорожек).
- Фильтры: changes / k8s_events / warnings / unhealthy.
- Time scrubber/lens, retention note.
- **Storage**: memory (кольцо 10k), SQLite, PostgreSQL; retention и max size
  (`--timeline-storage`, `--timeline-db`, `--timeline-max-size`).
- История по workload с пагинацией; change evidence для агентов
  (`get_changes`).
- **Нет UI-журнала «кто что изменил»**: сервер пишет audit-строки в лог, но
  отдельного экрана аудита действий пользователя нет.
  `web/src/components/timeline/*`, `internal/timeline/`, `pkg/timeline/`

---

## 9. Helm

- Список релизов и detail (status, namespace, chart, revision, age).
- **Values**: просмотр, редактор, preview-render, diff к ревизии.
- Manifest viewer; diff ревизий: values, notes, hooks, resources.
- **Upgrade** (+ streaming прогресс, доступные версии, source versions),
  **rollback** (+ stream), **uninstall**.
- **Install wizard** с редактированием values и streaming-логом.
- Репозитории чартов, **OCI sources**, поиск чартов, **Artifact Hub** search.
- Batch `/upgrade-check`, «update available», tracked chart source.
- **Hook diagnostics**: live Job/Pod/Event/log evidence; разбор failed upgrade
  и rollback.
- Работает без доступа к Secret: inventory из аннотаций объектов
  (`ObservedHelmNotice`).
- Write kill switch `--disable-helm-write`.
  `internal/helm/`, `web/src/components/helm/*`, `docs/helm.md`

---

## 10. GitOps

- Fleet-обзор и detail для **ArgoCD** (`Application`, `ApplicationSet`,
  `AppProject`) и **FluxCD** (`GitRepository`, `OCIRepository`,
  `HelmRepository`, `Bucket`, `Kustomization`, `HelmRelease`, `Alert`).
- **Диагноз**: field-level drift, события, застрявшие drift-loop, разбор ошибок
  операции.
- **Sync, suspend, resume, reconcile, rollback** из UI и MCP.
- Дерево ресурсов приложения, insights, история, per-app tabs.
  `web/src/components/gitops/`, `internal/argocd/`, `pkg/gitops/`, `docs/gitops.md`

---

## 11. Traffic

- Автоопределение источника: **Hubble (Cilium)**, **Istio**, **Caretta**,
  **Grafana Beyla**; мастер установки, если ничего нет.
- Анимированный граф RPS между сервисами; фильтры namespace / protocol /
  status code; focus на workload (в URL).
- Таблица flow records, fallback «graph too large», предупреждения о
  требованиях источника (Beyla `network` + `attributes.select`).
- Вкладка traffic-потоков в dock.
  `internal/traffic/`, `web/src/components/traffic/*`

---

## 12. Metrics, HPA, rightsizing, cost, capacity

- **Home vitals** и `/api/vitals` (counts + capacity/usage для fleet fan-out).
- **metrics.k8s.io**: live CPU/memory, top pods/nodes/resources, **history
  series**.
- **Prometheus**: авто-обнаружение или `--prometheus-url`, header auth,
  multi-cluster identity, raw PromQL endpoint.
- Curated-графики: resource, namespace, cluster, **HPA**, **PVC usage**,
  **restart chart**, workload rate/errors/latency/throttling.
- **Workload Metrics tab**: rate, HTTP errors, latency (Beyla/Istio), CPU,
  memory, throttling.
- **HPA diagnosis**: 14 состояний «почему не скейлится» (`limited_max`,
  `metrics_unavailable`, `scaled_to_zero`, …) + графики target/current.
- **Rightsizing**: скан-рекомендации CPU/memory с классами, drill-down и
  evidence-ограничениями (HPA ownership, OOM evidence, pod-level requests);
  при нехватке данных рекомендация withheld.
- **Cost (OpenCost/Kubecost)**: allocated cost, breakdown namespace/workload/
  node, efficiency score, trends, currency, cost per app/workload, rightsizing
  по стоимости.
- **Capacity (Karpenter)**: Overview / NodePool detail / Demand / Activity;
  scheduling card (pending pods, signatures, какой pool возьмёт, PDB overlap,
  affinity/topology-spread); certainty glyphs `= ≥ ≤ ?`.
- Отсутствующие метрики всегда `–`, никогда ноль.
  `internal/{prometheus,opencost,capacity}/`, `web/src/components/{resource,cost,capacity}/*`

---

## 13. Events

- Events как обычный kind + event-specific колонки.
- **Deduplicated events API** `/api/events` (dedupe + сортировка по свежести).
- Events в drawer и как источник Issues.
- Warning-events → Issues с admission/backoff контекстом.
- Опциональный полнотекстовый поиск по сообщениям событий.
  `internal/server/timeline_events.go`, `internal/issues/`

---

## 14. Checks: Cluster Audit и Upgrade Impact

**Cluster Audit** — сканер best practices, ~48 проверок:

- Security: privileged containers, privilege escalation, host namespaces,
  runtime socket mounts, секреты в ConfigMap и др.
- Reliability: нет probes, тег `latest`, одна реплика, нет PDB/topology
  spread, deprecated API, CNPG без backup/WAL, in-tree Barman и др.
- Efficiency: нет requests/limits, orphan ConfigMap/Secret, PVC без
  потребителя, долгий Pending, Released/Failed PV.
- Remediation-текст, ссылки, метки NSA/CISA и CIS, severity-фильтр,
  настройки подавления, opt-out аннотацией `radarhq.io/ignore-checks`.
  `pkg/audit/registry.go`, `web/src/components/audit/*`

**Upgrade Impact** — сравнение с целевой minor-версией Kubernetes:

- удалённые API, skew kubelet/kube-proxy, пересекающиеся PDB, удалённые
  feature gates, admission/drain/runtime/config проверки;
- статусы Blocked / Warning / Review / Incomplete / Passed / N/A, coverage
  states; порядок по требуемому действию.
  `/api/upgrade-readiness`, `pkg/upgradereadiness/`

---

## 15. Reachability и NetworkPolicy

- Пошаговая диагностика для Service, Ingress, HTTPRoute, GRPCRoute, Gateway:
  «дойдёт ли трафик до здорового процесса и какой hop ломается первым».
- kubectl-репродусер, прогноз блокировок NetworkPolicy.
- Опциональные DNS/TCP/TLS/HTTP probes с ноутбука (через apiserver proxy) или
  in-cluster probe Job; CLI `radar probe` с JSON-выводом.
- Оценка NetworkPolicy: какие политики применяются / заблокируют.
  `internal/trace/`, `pkg/probe/`, `pkg/netpol/`, `docs/reachability.md`

---

## 16. TLS, Image FS, Pod files, Compare, Curl

- **TLS**: парсинг TLS-секретов (subject, issuer, срок), бакеты healthy /
  <30d / <7d / expired, CSR, карточка на Home.
- **Image Filesystem Viewer**: просмотр/поиск/скачивание файлов внутри образа
  из Pod, без pull и exec; поддержка Docker Hub/Quay/GHCR/GCR/ECR/ACR через
  ImagePullSecrets.
- **Pod file browser**: list, preview текста, download, save-to-disk в desktop,
  upload; **без редактирования файлов**.
- **Compare**: side-by-side diff двух ресурсов одного kind, нормализация
  (`managedFields`, `resourceVersion`, last-applied), режимы Spec-only и
  Diff-only; плюс **Helm revision compare**.
- **Curl service**: HTTP-запрос к сервису изнутри кластера (server-side dial,
  работает там, где port-forward не может), статус/заголовки/тело, усечение.
  `internal/images/`, `internal/server/copy.go`, `web/src/components/{compare,curl}/*`

---

## 17. Applications и batch

- **Applications view**: группировка workload по `image:tag` + app-instance
  identity, membership index из Helm/GitOps, per-app tabs (workloads, issues,
  cost, history, evidence), application events.
- **Batch execution**: JobSet роль/index lineage, dependency gating, batch
  runs, сравнение членов, timeline прогона, JobSet admission.
- **Packages API**: «что установлено» — Helm releases + workload labels + CRD
  registrations + GitOps declarations в одном ответе.
  `/api/applications`, `/api/packages`, `web/src/components/{applications,execution}/*`

---

## 18. CloudNativePG и интеграции-воркспейсы

- **CNPG workspace** при обнаружении оператора: fleet, protection,
  declaration triage, HA, storage, history, restore, sessions, reports,
  parameters, actions, логи кластера.
- Cluster, Backup, ScheduledBackup, Pooler, Database, Publication,
  Subscription, ImageCatalog, ObjectStore.
- **Kueue**: почему Workload pending, позиция в очереди, ClusterQueue/
  LocalQueue.
- **Kyverno**: findings по ресурсу, покрытие политик, queued UpdateRequests.
- **Trivy**: Vulnerability/ConfigAudit/ExposedSecret/SBOM/RBAC/Infra/
  Compliance reports, wide drawer.
  `internal/cnpg/`, `web/src/components/cnpg/*`, `docs/cnpg.md`

---

## 19. RBAC, доступ, безопасность

- **ServiceAccount / Role / Binding details**: прямые и унаследованные
  привязки, эффективные права, поды на SA; обратный lookup subject → bindings.
- **Blast radius**: wildcards, cluster-admin, escalation-вербы, cluster-wide
  `create pods`.
- **My Permissions**: живой `SelfSubjectRulesReview`.
- **Capability-aware UI**: кнопки скрываются по реальным правам.
- **Auth**: `none` по умолчанию; `proxy` (oauth2-proxy, Pomerium, Cloudflare
  Access) и `oidc` (Google, Okta, Dex, Keycloak; discovery, JWKS, PKCE, claim
  mapping, back-channel logout).
- **Impersonation** per-user для чтения и записи; namespace discovery через
  SubjectAccessReview.
- **Session cookies** HMAC, sliding TTL, revocation list.
- **Read coverage honesty**: частичные ответы сообщают, чем сужены и какие
  пробелы; denied kinds fail closed.
- **Секреты**: значения Secret не отдаются; env reveal — отдельный
  RBAC-gated вызов; скрабинг логов/Helm values/MCP.
- **Audit-лог сервера**: структурные строки с user/groups/action/outcome/hash
  команды (только лог, без UI).
- Лимиты дорогих чтений: payload caps, list limits, timeouts,
  `--max-scope-candidates`.
  `docs/authentication.md`, `internal/auth/`, `pkg/rbac/`

---

## 20. AI: MCP и investigations

**MCP** (на том же порту, что UI):

- Четыре mount-точки: `/mcp` (полный), `/mcp-readonly`, `/mcp-apply`,
  `/mcp-investigation`.
- **~40 инструментов**: `get_dashboard`, `top_resources`, `list_resources`,
  `get_resource`, `get_topology`, `get_neighborhood`, `get_events`,
  `get_pod_logs`, `get_workload_logs`, `diagnose`, `list_namespaces`,
  `get_changes`, `get_cluster_audit`, `get_cluster_upgrade_readiness`,
  `get_runtime_versions`, `list_helm_releases`, `get_helm_release`,
  `get_helm_chart`, `list_packages`, `issues`, `search`,
  `get_subject_permissions`, `query_prometheus`, `discover_metrics`,
  `get_prometheus_rules`, `get_cost`, `get_rightsizing`, `wait_for`,
  `collect_application_evidence`, `exec_pod`, `curl_service`;
  write: `manage_helm`, `manage_workload`, `manage_rollout`, `manage_cronjob`,
  `manage_gitops`, `manage_node`, `apply_resource`, `patch_resource`,
  `delete_resource`.
- **MCP resources**: `cluster://health`, `cluster://topology`,
  `cluster://events`.
- Safety: `readOnlyHint` vs `destructiveHint`, confirmation-токены, mutation
  verification, Secret scrubbing, per-user impersonation.
- stdio-каталог (`--mcp-catalog-stdio`, `--mcp-catalog-only`) для реестра и
  инспекторов; Docker-образ в MCP Registry.
- **CEL-фильтры** для list/search/issues; `wait_for` с JSONPath.
- Minified agent-контекст `/api/ai/resources/...` без Secret data.

**AI investigations**:

- Запуск из ресурса, из Issue, со страницы investigations или
  `radar diagnose <kind>/<name>`.
- Поддерживаемые CLI: Claude Code, Codex, Cursor Agent, OpenCode
  (авто-обнаружение в PATH).
- Одна Findings-страница: findings + activity (reasoning/tool calls) +
  evidence + next steps + follow-up.
- Evidence с provenance, отказ/неуверенность обрабатываются явно.
- Apply fix только после подтверждения и только к тому ресурсу.
- Два профиля изоляции: «Radar safeguards» (Claude/Codex, чужие MCP и запись
  выключены) и «Your agent setup» (Cursor/OpenCode, авто-approve раскрыт).
- Persisted run history `~/.radar/ai-runs.db`, list/get/stop/clear.
- MCP setup dialog с копированием URL и каталогом инструментов.
  `internal/mcp/`, `internal/ai/`, `internal/diagnosecli/`, `docs/mcp.md`

---

## 21. Поиск и клавиатура

- Omnibar `⌘K`: серверный поиск + недавние + секции Views / Kinds /
  Clusters / Namespaces / Actions; клик по chip namespace/kind добавляет
  модификатор.
- Синтаксис: `ns:`, `kind:`/`k:`, `label:`/`l:`, `image:`/`img:`,
  `cluster:`/`c:`, кавычки, IP/IP:port.
- Coverage honesty: поиск сообщает о пробелах и RBAC-сужении.
- `/` — фокус поиска, `?` — все шорткаты.
- Навигация: `g h` Home, `g r` Resources, `g i` Issues, `g t` Topology,
  `g a` Applications, `g l` Timeline, `g f` Traffic, `g m` Helm, `g o`
  GitOps, `g u` Checks, `g p` Capacity, `g c` Cost; `n` namespace,
  `c` context, `t` тема, `g s` настройки.
- Таблица: `j`/`k`/↑/↓, `g g`/`G`, Enter/`d` открыть, `y` YAML, `l` логи,
  `N`/`A`/`S` сортировка, `b` чекбоксы, `[`/`]` kind, Esc.
- Логи: `S` stream/stop, `Ctrl+F`, Enter/Shift+Enter, Esc.
- GitOps detail: `s` sync, `r` refresh, `Shift+R` force, `t` terminate.
- Topology: `/`, `f`, `+`/`-`/`0`.
- Ремаппинга клавиш нет — фиксированный реестр + оверлей `?`.
  `web/src/hooks/useKeyboardShortcuts.tsx`,
  `packages/k8s-ui/src/components/ui/ShortcutHelpOverlay.tsx`

---

## 22. Логи

- Streaming pod logs через SSE; follow/pause, «jump to live» с числом
  отложенных строк.
- Container picker: multi-container, init помечены `(init)`, открывается на
  контейнере, где под завис.
- Previous instance, диапазоны 100/500/1000/5000 строк или 1/5/15/30/60 минут.
- Поиск: Ctrl+F, next/prev, счётчик, case/regex.
- **Шесть форматов timestamp**: local, UTC, ISO local/UTC, relative, epoch.
- **Structured logs**: JSON-aware Compact / Expanded (tree) / Raw, level-чипы
  ERR/WARN/INFO/DBG/OTHER с фильтром.
- ANSI-цвета, сворачивание stack trace, wrap; настройки в localStorage.
- **Export**: visible/all, форматы txt / JSON / CSV, copy line, download
  (в desktop — нативный диалог).
- **Workload logs** (агрегация по подам), multi-pod/all-containers,
  **JobSet/Ray/scheduled workload/CNPG** логи.
- Честные состояния `logs_unavailable`, `container_not_started`,
  `no_previous_run`.
- Логи живут в dock-вкладках и переживают навигацию.
  `packages/k8s-ui/src/components/logs/*`, `web/src/components/dock/*`

---

## 23. Терминал, exec, port-forward

- **Pod exec** по WebSocket: выбор контейнера, resize, origin-check.
- **Shell cascade** `bash -il` → `ash` → `sh`, override
  `--pod-shell-default`.
- **Локальный терминал** (PTY) с context-pinned kubeconfig 0600 и баннером
  проверки контекста.
- **Терминал ноды** через debug pod.
- Dock-вкладки: несколько сессий, переименование, xterm search,
  copy-on-select, clipboard toolbar, scrollback.
- «Run in Terminal» из ошибок auth и AI-предложенных команд.
- Kill switches: `--disable-exec`, `--disable-local-terminal`.
- **Аудит exec**: структурные строки с hash команды, числом аргументов,
  исходом.
- **Port-forward**: pod / service / deployment, picker доступных портов,
  локальный override, панель активных сессий, retry/stop/minimize.
- **Auto port-forward** для интеграций; `--disable-auto-port-forward`.
- In-cluster: вместо авто-форварда — кнопка копирования
  `kubectl port-forward`.
  `internal/server/{exec,logs,portforward}.go`, `web/src/components/{dock,portforward}/*`

---

## 24. Настройки, темы, состояние

Секции: **Overview**, **My permissions**, **Connection**, **Metrics**,
**Cost**, **Argo CD**, **AI investigations**, **Privacy**, **Advanced**
(MCP + Timeline).

- `~/.radar/config.json` — startup-конфиг (kubeconfig, port, browser, timeline,
  MCP, интеграции), редактируется из UI.
- `~/.radar/settings.json` — тема, колонки, favorites, active namespaces,
  hidden clusters.
- **Operator-managed** настройки: read-only сводка, когда конфигом владеет
  Helm chart.
- Формы интеграций: Prometheus URL/headers, OpenCost/Kubecost (API key,
  currency), Argo CD (URL/token, probe-before-persist).
- Темы: light/dark, persisted.
- Prefs: логи (wrap, timestamp format, structured mode), терминал
  (copy-on-select, font, search), таблицы (колонки/порядок/pin/width/custom/
  sort по kind), вид (sidebar width, kinds-open, swimlane pinning, nav rail).
- Privacy: usage-data opt-in с предпросмотром отправляемого; `RADAR_DISABLE_*`.
- Keybindings: фиксированный реестр, scope-based, без ремаппинга.

---

## 25. Уведомления и обратная связь

- Toast-система для успеха/ошибок мутаций.
- Уведомление о новой версии (`/api/version-check`), self-update в desktop.
- What's New с «seen»-трекингом.
- Sync progress panel при прогреве informer'ов.
- Баннеры: нет доступа к кластеру, in-cluster/Cloud funnel, unchecked sources,
  retention, GitOps/CNPG operator, Product Hunt, GitHub star.
- **Alerting-правил и каналов (Slack/email/webhook) в OSS нет** — это Radar
  Cloud.

---

## 26. Экспорт, API, расширяемость

- Download YAML манифеста (server-generated поля вырезаны).
- Export логов txt/JSON/CSV.
- Download/upload файлов пода; download файлов из образа.
- CNPG report bundle.
- Diagnostics: копировать Markdown/JSON, «Report Bug» с prefilled GitHub issue.
- Copy: MCP URL, name, YAML, kubectl/port-forward команды, version info.
- **~330 REST-эндпоинтов** для автоматизации.
- **Нет плагинов/extension SDK**: расширение = код (CRD renderers,
  embedding через npm/Go-пакеты).
- Библиотеки: `@skyhook-io/radar-app`, `@skyhook-io/k8s-ui`, Go-модуль
  `github.com/skyhook-io/radar/pkg`.

---

## 27. Режимы поставки

| Режим | Что даёт |
|---|---|
| kubectl plugin / CLI | `kubectl radar`, `radar`, много флагов, браузер + MCP |
| Desktop (Wails v2) | Нативное окно, меню/акселераторы, custom title bar, single-instance, нативные диалоги, in-app updater, About |
| In-cluster Helm | Deployment, Service, Ingress, **Gateway API HTTPRoute**, PVC, probes, `operator-settings`, раздельный RBAC (cluster-read / helm / node-ops / AI), CRD group toggles, auth modes, timeline postgres, Cloud enrollment |
| Docker | `ghcr.io/skyhook-io/radar`, mounted kubeconfig, MCP Registry пакет |
| Embedded / library | `<RadarApp apiBase basename router navSlots queryClient />`, chromeless, runtime config, version-skew guard |
| MCP-only | `--mcp-catalog-only`, `--mcp-catalog-stdio` без инициализации Kubernetes |
| Demo / testserver | `cmd/testserver` с фикстурами и load-test (50k pods, live scale) |
| CLI subcommands | `radar diagnose`, `radar probe`, `radar cloud install|status` |
| Cloud agent | WebSocket tunnel в Radar Hub, self-upgrade, enrollment keys |
| Дистрибуция | Homebrew (`kubectl-radar`, cask), Krew, Scoop, curl/PowerShell installers, GitHub releases, .deb/.rpm/.AppImage/.dmg |

---

## 28. Встроенные интеграции

Автодискавери любых CRD; для популярных стеков — dedicated renderers,
topology, AI context, evidence. Список из README:

Workloads, Networking, Config, Storage, Autoscaling, Cluster, CSR, GitOps
(Flux/Argo), Argo Rollouts, Argo Workflows, Reflector, cert-manager, Gateway
API, Istio, Traefik, Contour, Knative (Serving/Eventing/Sources/Flows/
Networking), Karpenter, OpenTelemetry Operator, Flagger, KEDA, Prometheus
Operator, Trivy, Strimzi, RabbitMQ, NATS, Velero, External Secrets, Secrets
Store CSI, Vault, CloudNativePG, Crossplane, Kyverno, Sealed Secrets, DRA,
NVIDIA GPU Operator, Calico, Kueue, KubeRay, KServe, Inference Gateway, Batch
(LWS/JobSet/Volcano/Kubeflow), KAI Scheduler, Model serving (KAITO/NIM/AMD),
OpenCost/Kubecost, Packages.

Плюс **local runtime evidence**: RabbitMQ alarms, NATS JetStream backlog,
Vault seal state — только по явному запросу, никогда автоматически.

---

## 29. Чего у Radar нет

1. **Нет `kubectl describe`-подобного текстового вида** — только структурированный
   Overview и YAML.
2. **Нет вкладок ресурсов (Lens-style)** — detail это URL-backed drawer,
   разворачивающийся в страницу.
3. **Нет плагинов / extension marketplace**; расширение только кодом.
4. **Нет alerting-правил и каналов уведомлений** — Cloud.
5. **Нет fleet / multi-cluster view в OSS** — один активный контекст;
   мультикластерность только в Radar Cloud.
6. **Нет TUI** — только CLI-подкоманды `diagnose`/`probe`/`cloud`.
7. **Нет UI-журнала действий пользователя** — audit только в stdout-логах.
8. **Нет настройки плотности строк таблицы** и размера шрифта таблицы.
9. **Нет ремаппинга клавиш**.
10. **Нет session recording / replay** терминалов; **нет редактирования
    файлов** в pod file browser (только download/upload/preview).
11. **Нет reveal значений Secret** — `.data` не возвращается вообще (env
    reveal — отдельный узкий вызов).
12. **Нет multi-namespace informer scoping** — `--namespace-scope` это один
    namespace.
13. **Нет собственного vulnerability scanning** — показывает Trivy CRD, если
    Trivy установлен.
14. **Нет встроенного Prometheus/Grafana** — читает существующий бэкенд и
    рисует `–`, если его нет.
15. **Нет мультиоконности**.
