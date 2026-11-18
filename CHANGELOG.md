# Changelog

Что изменилось в mLens — по людским блокам, а не по файлам. Новые версии сверху.

**Как ведём:** каждое обновление — новая версия `## vX.Y.Z — DD.MM.YYYY, HH:MM`
(patch +1 к предыдущей; время — момент, когда набор изменений собран).
Раздела `Unreleased` больше нет. Более ранняя история (`v2.2.9` → `v2.3.0` и
дальше) — в `git log` и `IMPLEMENTATION_PLAN.md`.

---

## v2.4.22 — 18.11.2026, 19:10

### Чёрный экран на Helm-чарте
- Причина: в Helm release-записи `hooks[].last_run` — это **объект**
  (`started_at`, `completed_at`, `phase`), а не строка. Рендер передавал его в
  `formatTimestamp` и дальше как React-child, React падал с
  `Objects are not valid as a React child` и размонтировал всё дерево — отсюда
  чёрный экран на `kore-victoriametrics-stack`.
- Исправлено: main маппит `last_run` в `lastRun { startedAt, completedAt, phase }`;
  в секции Hooks показываются phase-бейдж (`Succeeded`/`Failed`/…), время
  завершения и events. Тип `HelmHookInfo.lastRun` обновлён.
- Добавлен **ErrorBoundary** вокруг контента resource-details: любая ошибка
  рендера вкладки теперь показывает inline-ошибку с кнопкой «Try again» вместо
  чёрного окна. Сбрасывается при смене ресурса/вкладки.
- Проверено на `lz1-чч-preprod` / release
  `kore-victoriametrics-stack` (ns `kore-monitoring-system`): drawer открывается,
  Revisions и `Hooks (1)` (`Job servicemonitors-etcd-secret-hook`,
  `pre-upgrade`, `Succeeded`, 18 Sept 2026, 17:43:57) рендерятся, чёрного экрана
  нет.

---

## v2.4.21 — 18.11.2026, 19:02

### Helm Compare: видимый дифф
- Сравнение ревизий теперь **прокручивается к первому изменению**
  (`revealFirstDiff` после асинхронного расчёта диффа). Раньше модалка
  открывалась на первых строках манифеста — одинаковых у обеих ревизий, поэтому
  казалось, что цветов нет (изменение было ниже, за пределами экрана).
- Цвета диффа усилены для всех тем: `DIFF_COLORS` в `lib/monaco.ts` задаёт
  зелёный/красный фон строк и символов и маркеры overview-линейки. Дефолтный
  Monaco-альфа (20%) на тёмном фоне почти не читался.
- То же поведение у диффа двух ресурсов (кнопка Diff / Compare across clusters),
  т.к. `YamlDiffEditor` общий.
- Проверено на release `docs`: сравнение 680 → 681 подсвечивает строку 61
  (`…docs:master-55dda48a` → `…master-5849d9b7`) красным/зелёным и сразу
  открывается на ней; переключение Manifests/Values сохраняет автоскролл.

---

## v2.4.20 — 18.11.2026, 18:46

### Helm: история, сравнение, notes/hooks
- **Починен helm history**: `helmDetailRow` не переносил `revisions` и
  `resources` в объект для drawer, поэтому секции истории и ресурсов были пустыми
  (в API они приходили, но до UI не доезжали). Теперь в drawer видны все
  ревизии (у `docs` — 10 при `--history-max` по умолчанию), текущая подсвечена.
- **Compare** как в Radar: выделяешь ревизию кнопкой Compare, затем вторую —
  открывается модалка с Monaco-диффом; переключатель **Manifests / Values**,
  A — старая ревизия, B — новая. Кнопка View по-прежнему показывает values,
  manifests и notes выбранной ревизии.
- **Release notes** и **Hooks** из release-записи (read-only): notes без ANSI,
  hooks — kind/name/events/last run/weight в тултипе.
- **Copy** для notes, values и manifests; заголовки секций показывают ревизию
  (`Values · revision 681`).
- Скорость списка Helm: newest revision выбирается по labels (`name`,
  `version`) и декодируется только он, а не все 2000+ revision-секретов
  (в dev-кластере 2113 → 429 декодирований, загрузка ~17с вместо десятков).
- Защита от «вечной загрузки»: `useResourceList` больше не запускает новый
  запрос поверх незавершённого для того же вида — раньше медленный Helm-list
  отменялся каждые 30с и таблица навсегда оставалась на `Loading…`.
- Установка/апгрейд чартов по-прежнему не реализуемы: нужен Helm template
  engine; перенесены только фичи, работающие с сохранёнными release-секретами.

---

## v2.4.19 — 18.11.2026, 18:25

### Сортировка CPU/Memory по фактическому usage
- Колонки **CPU** и **Memory** в таблицах Pods и Nodes теперь сортируются по
  **реальному потреблению** из metrics.k8s.io, а не по requests (у подов) и не
  по allocatable (у нод).
- Для подов `value` считает сумму usage по контейнерам (`context.podMetrics`),
  для нод — `context.nodeMetrics`; без сэмпла значение 0, поэтому поды/ноды без
  метрик уходят в начало возрастания и в конец убывания.
- `cellContext` таблицы теперь включает `podMetrics`/`nodeMetrics`, так что
  сортировка видит те же живые метрики, что и ячейки; поиск по числам usage
  тоже работает.
- Проверено на `dev-common`: CPU ↓ начинается с `2434m`, `1365m`,
  `1185m` (реальное потребление), а не с подов с `2000m` request.

---

## v2.4.18 — 18.11.2026, 18:16

### Tooltip CPU/Memory у подов — как в Radar
- Тултип бара CPU/Memory показывает разбивку по контейнерам: контейнеры
  отсортированы по проценту (топ-3, дальше `+N more`), каждый —
  `used · % · limit · req` (или `request`, или `no limit`).
- Внизу — контекст ноды, как в Radar: `Node <name>` и
  `X% used · this pod Y%`. Для этого `useResourceMetrics` в таблице Pods
  дополнительно подтягивает node metrics и Node-объекты (allocatable), только
  когда видны колонки CPU/Memory.
- Если метрик ноды нет — честная строка `node metrics unavailable`.

### Age: дата создания в тултипе
- **Везде** при наведении на Age — Tooltip `Created` с точным
  `creationTimestamp`: в колонке Age таблиц (`AgeCell`), в свойствах drawer
  (`AgeProperty` в Overview/Details/Node/Helm) и в карточке Age у CR-overview.
- Проверено: под `access-service-database-0` — CPU-тултип
  `pgwatch-agent 15m · 8% · 200m limit · req 100m` / `postgres 67m · 3% · 2000m
  limit · req 250m` / `Node …` `15% used · this pod <1%`; Age — `CREATED
  02 Nov 2026, 18:21:16`.

---

## v2.4.17 — 18.11.2026, 18:11

### Полоски ресурсов как в Radar
- `ResourceBar` по умолчанию теперь **stacked**: строка `used / total` и процент
  сверху, сама полоска — под ней (раньше всё было в одну строку). Затронуты
  CPU/Memory в таблицах Pods и Nodes.
- **CPU — всегда в millicores**: `57m / 2200m`, а не `57m / 2.2`. Добавлен
  `formatCpuMilli`, по нему же считаются per-container строки в тултипе.
- **Memory — короткие единицы Radar**: `851Mi / 2.2Gi` (`formatMemoryShort`)
  вместо `MiB`/`GiB` с округлением до целых.
- Новая схема `count` для полоски (синяя, янтарная после 90%).

### Nodes: занятые поды из максимума
- Колонка **Pods** в таблице Nodes теперь показывает **фактическое число подов
  против `allocatable.pods`**: `88 / 250` + процент, полоска под числами,
  тултип «88 scheduled of 250 allocatable». Сортировка по этой колонке — по
  фактическому количеству.
- Счётчики берутся из нового хука `useNodePodCounts`: поды листятся один раз на
  весь кластер (постранично) и агрегируются по `spec.nodeName`, только пока
  открыта таблица Nodes; обновление не чаще 30с. При ошибке ячейка честно
  показывает `–`, а не ноль.
- `allocatable.pods` парсится как Quantity (`110`, `1k`) через
  `parseQuantityCount`, а не как CPU.
- Проверено на `dev--common`: значения совпали с
  `kubectl get pods --field-selector spec.nodeName=…` (88 из 250).

---

## v2.4.16 — 18.11.2026, 17:57

### Колонка Age
- **Age есть во всех таблицах** (включая Helm-релизы и кастомные ресурсы) и
  по-прежнему стоит последней.
- Ширина по умолчанию уменьшена до **60px**, для неё включён компактный
  отступ (`compact: true` → `px-2` вместо `px-4`), поэтому заголовок `AGE` и
  значение (`6h`, `35d`) не обрезаются.
- Ручной ресайз сохраняется: если ширину Age уже меняли, берётся сохранённое
  значение (в профиле, например, 72px), а не новый дефолт.

---

## v2.4.15 — 18.11.2026, 17:51

### Колонки: Age и порядок по умолчанию
- Исправлен дубль **Age**: CRD-виды с собственной printer-колонкой `Age`
  (например, CAPI `SingleMachine`) больше не показывают два AGE. Printer-колонка
  пропускается, если она называется `Age` или смотрит в
  `.metadata.creationTimestamp` — остаётся общий Age-столбец.
- Порядок колонок по умолчанию для **всех** видов теперь заканчивается парой
  **STATUS → AGE**. Раньше Age был последним, а Status стоял в середине
  (у CR — сразу после Namespace).
- Своя раскладка не ломается: `settings.tableColumnOrder` применяется поверх
  дефолта, поэтому если колонки уже двигали, приложение запомнит и сохранит
  этот порядок при переключении видов/кластеров и перезапуске.
- Проверено на `msk-grb-stg-iaas-mgmt` / `SingleMachine`:
  `NAME, NAMESPACE, CLUSTER, PHASE, READY, VERSION, STATUS, AGE`, второй AGE
  отсутствует.

---

## v2.4.14 — 18.11.2026, 17:45

### Conditions в тултипах — для всех ресурсов
- Tooltip условий больше не привязан к Node: любой **Status** в таблице и в
  шапке resource-details показывает `status.conditions` ресурса (Pod,
  Deployment, Job, CRD и т.д.).
- В тултипе условия **сортированы по времени перехода** (свежие сверху), у
  каждого: тип, `True/False/Unknown` с цветной точкой по смыслу, reason,
  message, относительный возраст (`2h ago`) и точное время
  (`lastTransitionTime`). Если время есть только в `lastUpdateTime`, берётся оно.
- В секции Conditions деталей относительный возраст стал интерактивным —
  наведение показывает точный `lastTransitionTime`.
- Статус-пилюли в Overview и в шапке drawer используют ту же карточку, поэтому
  поведение одинаково во всех местах.

---

## v2.4.13 — 18.11.2026, 17:38

### Tooltip на статусы и условия
- **Status** в таблицах: бейдж теперь показывает Tooltip с деталями —
  `ImagePullBackOff` → сообщение контейнера/образа, `Updating` →
  `ready/desired · updated/desired`, `NotReady` → reason. Для Node в карточку
  статуса добавлен полный список conditions.
- **Conditions** в таблице Nodes: вместо нативного `title` — Tooltip со всеми
  условиями: тип, `True/False/Unknown` (цветная точка по смыслу: давления и
  Unavailable инвертированы), reason и message.
- Тот же Tooltip у статус-пилюли в деталях Node и у статусов в Overview
  (там, где есть detail).
- В таблице Node статус `Scheduling disabled` теперь объясняет
  `spec.unschedulable = true` и Ready-reason.

---

## v2.4.12 — 18.11.2026, 17:34

### Node: taints
- В таблице Nodes колонка **Taints** больше не печатает первый taint: показывается
  **количество** (`2 taints`), а при наведении — дизайн-системный Tooltip со
  списком всех taint'ов (`key=value:effect`, цветная точка по effect).
- В деталях Node секция **Taints** вместо списка бейджей показывает один
  счётчик-бейдж (янтарный при `NoSchedule`, красный при `NoExecute`, нейтральный
  для `PreferNoSchedule`); наведение раскрывает тот же список.
- Данные по-прежнему из `spec.taints` (helper `nodeTaints`), тултип общий —
  `NodeTaintsTooltip`.

---

## v2.4.11 — 18.11.2026, 17:25

### Сортировка таблиц
- Список ресурсов открывается **по времени, новые сверху** (`Age ↓`) — это
  дефолт для любого вида, который ещё не сортировали.
- Последняя явная сортировка запоминается **для каждого вида отдельно**
  (`settings.tableSorts`, ключ `<apiVersion>|<kind>` — Pods, CRDs, Deployments и
  т.д.), переживает переключение кластеров и перезапуск приложения. Если новый
  вид открывается впервые — снова по времени.
- Клик по заголовку сортирует по возрастанию, повторный — по убыванию; поле
  «время» берётся из `creationTimestamp`, а сохранённый ключ, которого больше нет
  в колонках вида, игнорируется и заменяется дефолтом.
- Сортировка в persisted-настройках валидируется в main (только `asc`/`desc` и
  непустой ключ), мусор из файла не ломает таблицу.

---

## v2.4.10 — 18.11.2026, 17:15

### Статусы как в Radar
- **Pod**: статус теперь показывает реальную причину, а не общий «Pending» —
  `ContainerCreating`, `PodInitializing`, `Pending`, `Scheduling`,
  `Terminating` (жёлтые), `CrashLoopBackOff`, `ImagePullBackOff`,
  `ErrImagePull`, `ErrImageNeverPull`, `InvalidImageName`,
  `CreateContainerConfigError`, `OOMKilled`, `ContainerCannotRun`, `Evicted`
  (красные), `Completed` (синий), `Running` (зелёный). В тултипе — сообщение
  контейнера/планировщика.
- **Ворклоады** (Deployment/StatefulSet/ReplicaSet): во время раскатки — жёлтый
  **Updating** (а не `1/2 updated` / синий `Rolling out`), при простое —
  красный **Not ready**, при `ReplicaFailure` / `ProgressDeadlineExceeded` —
  **Failed**. В тултипе `ready/desired · updated/desired`.
- **DaemonSet**: те же правила (`Updating` / `Not ready` / `Running`).
- **Квадраты контейнеров**: `ContainerCreating`/`PodInitializing` теперь
  янтарные (раньше сразу красные), ошибки и terminated — красные, running без
  ready — янтарный, ready — зелёный.
- Проверено вживую на dev-кластере: при `rollout restart` статус менялся
  `Running → Updating → Running`, новый под проходил
  `Pending → ContainerCreating → Running`, удаляемый — `Terminating`; битый
  образ давал красный `ErrImagePull`. Уборка за собой выполнена.

---

## v2.4.9 — 18.11.2026, 16:50

### Diff между кластерами
- В меню ресурса (⋮ и правый клик) появились пункты **Select for comparison** и
  **Compare with selected** — как в VS Code. Закреплённый ресурс хранится
  глобально (`catalogStore.compareSelection`), поэтому переживает переключение
  кластеров.
- Над таблицей, пока есть закреплённый ресурс, висит полоса
  `For comparison: kind/namespace/name · кластер` с кнопкой **Clear** и
  подсказкой, что делать дальше.
- Диалог диффа теперь принимает две полные ссылки (`ResourceKey`) и
  подгружает каждую из своего кластера: можно сравнивать **разные виды в разных
  кластерах**. В шапке у сторон A/B подписаны вид, namespace и кластер; тот же
  Monaco-дифф, тумблер служебных metadata и Swap.
- Выделение двух строк + кнопка **Diff** в панели выделения работает как
  раньше (один кластер, один вид) и открывает тот же диалог.

---

## v2.4.8 — 18.11.2026, 16:43

### Скоуп namespace
- В меню выбора namespace **выбранные пространства теперь сверху**, сразу под
  «All namespaces», и отделены тонкой линией от остальных (внутри — по
  алфавиту). Поиск и переключатель системных namespace фильтруют обе группы.

### Выделение в таблице (selection bar)
- **Annotate** открывает диалог со всеми сохранёнными аннотациями и
  **галочками**: можно отметить сразу несколько (есть Select all / Clear all) и
  применить их одним merge-patch на ресурс. Кнопка показывает, сколько ключей
  выбрано; «Manage annotations…» переехал в этот же диалог.
- После применения аннотаций (и сохранённых лейблов) **выделение строк больше не
  снимается** — можно сразу накатить следующий пресет на те же ресурсы.

---

## v2.4.7 — 18.11.2026, 16:38

### YAML-редактор
- Вкладка YAML по умолчанию **скрывает служебные поля metadata** (`uid`,
  `resourceVersion`, `generation`, `creationTimestamp`, `managedFields`,
  `selfLink`) — переключатель «Ignore server metadata» рядом с видом ресурса,
  по умолчанию включён; во время редактирования заблокирован. На Apply это не
  влияет: main перечитывает живой объект и подставляет его `resourceVersion`.
  Тот же фильтр используется в Diff-диалоге (см. v2.4.6).

---

## v2.4.6 — 18.11.2026, 16:31

### Выделение в таблице (selection bar)
- Кнопка **Diff** рядом с Copy names — сравнение ровно двух выделенных ресурсов
  одного вида: бок о бок YAML в Monaco, **A** — первая строка по порядку таблицы,
  **B** — вторая. Оба объекта перечитываются из API, есть переключатель
  «Ignore server metadata» (`uid`, `resourceVersion`, `generation`,
  `creationTimestamp`, `managedFields`) и **Swap** сторон. Без двух выделенных
  строк кнопка неактивна и объясняет это в подсказке.

---

## v2.4.5 — 18.11.2026, 16:02

### Установка
- Root-postinstall (`scripts/postinstall.cjs`) теперь **самолечит отсутствие
  Electron-runtime**: если нет `node_modules/electron/path.txt` или `dist/`,
  запускается `node node_modules/electron/install.js` (~100 МБ, кэш в
  `~/Library/Caches/electron`). Свежий клон + `pnpm install` больше не
  заканчивается молчаливым `Error: Electron uninstall`; при
  `ELECTRON_SKIP_BINARY_DOWNLOAD`
  хил пропускается, при падении загрузки postinstall падает с инструкцией
  (лечится вручную: один раз онлайн запустить `node node_modules/electron/install.js`
  или повторить `pnpm install`).

---

## v2.4.4 — 18.11.2026, 14:10

### Логи
- В поиске по логам появились **стрелки ↑/↓** и счётчик `N / M`: Enter —
  следующее совпадение, Shift+Enter — предыдущее, Escape — закрыть. Переход
  прокручивает строку в центр и снимает автоследование вывода.
- Совпадения подсвечиваются прямо в тексте (жёлтый маркер, все вхождения).

### Helm
- Секция **Revisions** в деталях релиза — таймлайн как в Radar: кружок с номером
  ревизии (текущая — зелёная), бейдж статуса, `Current`, дата и возраст,
  описание. Кнопки: **View** (показать values/manifest этой ревизии, с плашкой
  «Viewing revision N» и возвратом к текущей) и **Rollback** (янтарная, только
  для не-текущих) с подтверждением.
- Секция **Resources** — все объекты, которые создаёт манифест (у cert-manager
  это 44 объекта: Deployments, Services, Roles, Webhooks…), каждый кликабельный
  и открывает ресурс в drawer.
- **Rollback работает без Helm-бинаря**: сохранённый манифест целевой ревизии
  применяется к кластеру, затем добавляется **новая** запись ревизии
  (история append-only — та же модель, что у Helm). Имя секрета
  `…<release>.v<N>`, лейблы и кодировка совпадают с Helm. Проверено на живом
  кластере на этапе подготовки payload (создание не выполнялось): rev 9 →
  `sh.helm.release.v1.cert-manager.v11`, JSON корректно декодируется.
- Честное ограничение: **upgrade с изменением values не реализуем** — он
  требует рендера шаблонов чарта (Go templates/sprig), а mLens сознательно не
  возит ни Helm-бинарь, ни его библиотеку. Вместо этого — просмотр values и
  правка/применение манифеста.

### Выделение в таблице (selection bar)
- Кнопка **Labels** рядом с Annotate: свои пресеты лейблов
  (`settings.labelPresets`), свой редактор, то же подтверждение и merge-patch.
- Кнопка **Copy names** — окно с копированием имён выделенного: разделитель
  выбирается кнопками (**перенос строк / запятая / точка с запятой**), есть
  переключатель `namespace/name`, результат в превью, кнопка Copy.

### Кнопка Create
- **+YAML в browse открывает нижнюю вкладку Create from YAML** — нижнее место
  стало главным. Старый модальный Create-диалог убран (оставался бы мёртвым
  кодом), после Apply из дока все открытые таблицы сами обновляются
  (событие `mlens:resources-applied`).

### Терминал и панели
- **Регулировка высоты дока вернулась**: по верхней кромке — полоса-захват
  8px на всю ширину с видимой ручкой и подсветкой при hover/драге. Высота
  считается от низа дока, поэтому статус-бар больше не даёт сдвиг на 24px;
  минимум — 160px, значение сохраняется в `dockHeight`.
- Разделители панелей (док, сайдбар, правый drawer) выведены из drag-региона
  окна: раньше `pointerdown` забирало перетаскивание окна, и ресайз молчал.
- Шапка дока: убрана надпись «Terminal»; вместо «＋» и выпадающего меню —
  сгруппированные кнопки **локальный терминал**, **Pod exec** (иконка
  контейнера) и **Create from YAML**. Пустое состояние — карточка с пунктирной
  рамкой и тремя плитками «иконка сверху, подпись снизу».
- Кнопка **New terminal** убрана из верхней панели: терминал открывается из
  дока, по `⌘T` и из командной палитры.
- Свёрнутая полоса открытых ресурсов над доком стала выше (32 → 44px), плашка
  «Show the minimized resource…» поднята на 16px.

### Копирование текста
- Текст в рабочей области (таблицы, детали, YAML, логи, overview, каталог)
  снова выделяется мышью и копируется по `⌘C`. Контентная панель `main`
  выведена из drag-региона: окно тянется за оболочку (верхняя панель, хотбар,
  полоса кластеров, статус-бар).

### Overview
- В карточке контейнера появились **Launch parameters** — `command` и `args`
  перед CPU/Memory, свёрнуты по умолчанию, раскрываются как YAML
  (`command:` / `args:` списком) с кнопкой **Copy as YAML**.
- Убраны мёртвые остатки Scale/Pause из Workload Overview — тайпчек снова
  зелёный.

### Хотбар и кластеры
- Правый клик по плитке: **Move up / Move down**, **Connect** (зелёный),
  **Disconnect** (красный), **Remove from hotbar**. Пункт Settings убран,
  как и «Move to slot N».
- Трёхбуквенные инициалы кластера теперь одинаковы в хотбаре, каталоге и
  сайдбаре: имя сначала делится по `-`, иначе работает старая эвристика
  (пробелы → `-`/`_` → `@`, для одного слова — две буквы).
- Каталог красит аватар тем же FNV-1a цветом, что и плитки хотбара (раньше был
  свой градиент). Пин «в избранное» в сайдбаре стал серым вместо янтарного.

---

## v2.3.0 — 17.11.2026 (два коммита + hotfix)

### Темы
- **Proton** — четвёртая тема, палитра из
  [luci-theme-proton2025](https://github.com/ChesterGoodiny/luci-theme-proton2025)
  (Apache-2.0): база `#0F1419`, карточки `#161C26`, акцент `#5E9EFF`, статусы
  `#6BCF7F / #FFD93D / #FF6B6B`. Токены в `themes.css`, отдельная Monaco-тема
  `mlens-proton`, ANSI-палитра терминала, принудительный dark. Атрибуция — в
  `THIRD_PARTY_NOTICES.md`.

### Каталог ресурсов (сайдбар)
- Новая группа **Control**: Lease, APIService, ControllerRevision,
  CertificateSigningRequest, FlowSchema, ResourceQuota, LimitRange,
  mutating/validating webhooks и admission-политики. **Config** теперь только
  про конфигурацию ворклоадов: ConfigMap, Secret, HPA/VPA, PDB, PriorityClass,
  PriorityLevelConfiguration, RuntimeClass, PodTemplate.
- Категория, которой ещё не было в сохранённом порядке перетаскивания,
  встаёт на своё дефолтное место, а не в конец (`mergeGroupOrder`).
- **Favorites** в сайдбаре получил шеврон: секция сворачивается, показывает
  счётчик и отделена тонкой линией от меню.

### YAML-редактор
- Иконки виджета поиска (шрифт codicon подключён — шеврон Replace и стрелки
  ↑/↓ снова видны) и **сворачивание блоков** (gutter-шевроны, Ctrl+Shift+[/]).

### Таблицы и статусы
- Колонки и статусы **как в Radar** для Service/Config/Access Control:
  Endpoints (из живого объекта Endpoints), Size, TLS **Expires**, Automount,
  бейдж Role/CR и превью `sa:`/`grp:` субъектов, CRD **Kind** + **Status**;
  статус Service — его тип (violet для LoadBalancer/NodePort).
- **Warnings-колонка** для Pods/ворклоадов/Nodes: иконка + счётчик, в тултипе —
  последнее Warning-событие, фильтр по reason (один запрос `type=Warning` на
  скоуп).
- Статусы: CRD Established/Terminating/Not established, у CR — бейдж статуса и
  плоский Status в приоритете Radar + свёрнутый Status details.

### Детали ресурсов
- **Service**: баннеры «Load balancer pending» и «No pod selector», полный
  список свойств (traffic policy, IP families…), NodePort в таблице портов,
  секция **Endpoints** с live-адресами.
- **Access Control**: ServiceAccount — permissive-grant баннер, прямые и
  унаследованные привязки, эффективные права, used-by pods, workload identity;
  Role/ClusterRole — wildcard-баннер, обратный поиск привязок, карточки правил;
  RoleBinding — баннеры No subjects / Wide grant, ссылка на роль, живые правила
  с состояниями orphan/403, карточки субъектов.
- **Policy** — секция на Overview Pod и ворклоадов: отчёты
  PolicyReport/ClusterPolicyReport кластера, бейджи Fail/Warn/Error/Skipped,
  `N other checks passing`, честные состояния «нет движка / не проверено /
  нет политики / часть семейств не прочитана».
- **Secret**: секция Certificate (subject, issuer, срок, баннер
  expired/expiring) — парсер сертификатов чистый DER, без Node-API, проверен
  на 99 реальных сертах.
- **Ноды**: Issues/Cordoned-баннеры, Node info, Capacity со строкой In use,
  живой Resource usage, Addresses, Platform, Taints, Conditions и список
  **Pods on this node**; **Debug shell** — YAML привилегированного пода →
  apply → ждём Running → exec-консоль в доке, под удаляется вместе с вкладкой.
- **Цепочка owner** в Details: owner → его owner (до 8 уровней), кликабельные
  строки со статус-бейджами, недоступные помечаются, колонка скроллится.
- **Labels/Annotations**: кнопка Edit в секциях Details и пункт в меню строки —
  редактор `key=value` (`-key` удаляет) с шагом подтверждения
  «+N set / −N removed» перед merge-patch.

### Прочее
- **Related**: фильтр (поиск + regex), чипы по kind, счётчики
  `видно / всего`; работает и у ноды с одной группой.
- **Volumes** в Overview пода кликабельны: ConfigMap/Secret, включая источники
  projected.
- **Переключение на новый кластер** — вкладка активируется сразу, анимация
  входа идёт весь connect + discovery, ошибка попадает на экран Retry.
- YAML: поиск — стоковый виджет Monaco (Ctrl/Cmd+F, regex, регистр, whole
  word, счётчик, replace).
- Фикс **hotfix**: JSONPath printer-колонок CRD — предикаты
  `[?(@.type=='Ready')]`, формы `$.` и `{…}`, ключи лейблов с точками
  (`labels['cluster\.x-k8s\.io/cluster-name']`) — колонка Cluster у
  KubeadmConfig снова показывает значение; плюс сохранение порядка перетаскивания
  меню сайдбара.

---

## v2.2.9 — 17.11.2026

### Взято из Radar (детали и таблицы)
- **Service** в деталях: баннеры, полный список свойств, таблица портов,
  секция **Endpoints** (live-объект Endpoints, один запрос на скоуп).
- **Access Control**: ServiceAccount (Direct bindings / Inherited via groups /
  Effective permissions / Used by Pods / Workload identity / Secrets),
  Role и ClusterRole (wildcard-баннер, обратный поиск привязок, карточки
  правил), RoleBinding (No subjects / Wide grant, роль, живые правила,
  субъекты) — данные через `kube:rbac-subject` и `kube:rbac-role`.
- **Policy** — секция по отчётам PolicyReport/ClusterPolicyReport с честными
  состояниями (движок не установлен / RBAC запретил / ничего не применяется).
- **Certificate** у Secrets: subject, issuer, not-before, цветной срок,
  баннеры expired/expiring.
- **Статусы**: Service = тип ресурса, CRD = Established/Terminating/Not
  established, у CR — бейдж + плоский Status приоритетным порядком Radar.

### Таблицы
- Колонки как в Radar: **Endpoints**, **Size** (ConfigMap), **Expires**
  (TLS-секреты), **Automount** (SA), бейджи Role/CR и превью субъектов,
  **Kind** + **Status** у CRD.
- **Node**: CPU/Memory — бары usage÷allocatable (метрики теперь реально
  качаются для Nodes), колонки **Conditions** и **Taints**.

### YAML
- Стоковый find-widget Monaco: **Ctrl/Cmd+F**, regex, match case, whole word,
  счётчик `n of m`, replace (шрифт codicon подключён, чтобы иконки были видны).
- **Сворачивание блоков** (folding) в gutter.

### Ноды
- **Debug shell**: диалог с редактируемым YAML привилегированного пода →
  Dry run / Apply → ожидание Running (с показом ImagePullBackOff и т.п.) →
  exec-консоль в доке; под помечен `mlens.io/debug-node` и удаляется при
  закрытии вкладки терминала.

### Прочее
- **Related**: фильтры — поиск с regex, чипы по kind, счётчики.
- **Volumes** кликабельны (ConfigMap/Secret, включая projected).
- **Переключение кластера**: вкладка активируется до ответа API, анимация
  входа на всём connect + discovery, ошибки → Retry.
- **Hotbar**: страницы по 10 слотов, селектор `‹ N ›` со списком страниц.
- Кнопка Create в browse теперь ведёт в нижнюю YAML-вкладку.

---

### Проверено вручную / скриптами
- Парсер сертификатов: 99/99 реальных сертов совпал с Node `X509Certificate`.
- JSONPath printer-колонок: 11/11 на CAPI-подобном CR.
- Helm: 63 релиза на живом кластере, detail (values/manifest/ревизии),
  payload rollback без создания.
- `pnpm build` (typecheck + electron-vite) зелёный на каждой итерации.
