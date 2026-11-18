# Changelog

Что изменилось в mLens за последние релизы — по людочитаемым блокам, а не по
файлам. Новые версии сверху. Всё собрано из коммитов `v2.2.9` → `v2.3.0` →
текущей работы за 17–18.11.2026; более ранняя история — в
`git log` и в `IMPLEMENTATION_PLAN.md`.

---

## Unreleased — текущая работа

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
