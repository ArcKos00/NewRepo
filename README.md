# Облік замовлень

Вебзастосунок для обліку замовлень за договорами.

**Стек:** NestJS (BFF/API) · React + TypeScript (Vite) · PostgreSQL (TypeORM).

## Можливості

- **Замовлення (договір)**: зовнішній номер договору, контрагент, дата договору,
  орієнтовна дата поставки, файл договору, примітки.
- **Найменування (товар)** у договорі: замовлена кількість та одиниця виміру. Для кожного
  найменування рахуються:
  - **отримано** — сума всіх поставок;
  - **не зможуть** — кількість, від якої відмовився постачальник (з причиною);
  - **очікуємо** = замовлено − отримано − не зможуть.

  Приклад: замовили 100, отримали 20, 20 не зможуть → очікуємо 60.
- **Поставки**: дата, номер накладної, скан накладної, кількість по кожному найменуванню.
  Більше, ніж очікується, прийняти не можна.
- **Етапи до підписання**: у формі договору (і звичайної, і з нерозподіленого) поле «Етап» —
  «Заплановано» → «Тендер оголошено» → «Тендер відбувся» → «Сформовано, не підписано» → «Підписано»
  (за замовчуванням). Поки договір не підписано, його стан — етап (переважає стани за поставками), він видно
  в списку й фільтрі «Стан», а **номер, контрагент і дата договору необов'язкові** (у списку такі договори —
  нагорі). Підписаний — лише з номером, контрагентом і датою (перевіряє і сервер, і обмеження в БД). На картці
  етап змінюється одразу (`PUT /api/contracts/:id/stage`), кнопка «Підписано» підписує; якщо чогось бракує —
  «Підписано…» відкриває редагування з етапом «Підписано». Кожна зміна етапу — у журналі.
- **Пошук**: одне поле (кожне слово — у номері, контрагенті або найменуванні) і кнопка «Фільтри»:
  контрагент, найменування, період дати договору та стан (етап до підписання / очікується / частково поставлено /
  прострочено / виконано). Без урахування регістру, зокрема для кирилиці. Список — сторінками по 25;
  пошук, фільтри й сторінка зберігаються в адресі сторінки.
- **Сторінка «Поставки»**: усі поставки по всіх договорах, той самий пошук і фільтри
  (накладна, № договору, контрагент, найменування, період дати поставки).
- **Нерозподілені найменування** (сторінка «Нерозподілені»): найменування, внесені без договору, —
  назва, кількість, од. виміру, дата внесення, примітка (Enter у формі додає й повертає до назви).
  Стан рахується: нерозподілено / частково розподілено / розподілено, видно, в які договори скільки пішло.
  Пошук, фільтри за станом і датою внесення. Видалити можна лише ще не розподілений запис.
- **Замовлення з нерозподіленого**: зліва — усе доступне з пошуком, посередині — що йде в договір, справа —
  поля договору. Перетягування (або кнопка «→») відкриває вікно з кількістю — Enter переносить усю;
  рядок можна перетягнути назад. Перед створенням — підтвердження. Однакові найменування (назва й од.)
  стають одним рядком договору. Видалили договір чи рядок у ньому — кількість повертається в нерозподілене;
  зменшили кількість у договорі — повертається надлишок (з останніх розподілів).
- **Теми К-2** (сабмодуль `packages/k2-styles`, `main` після тегу `v0.2.0`): перемикач у шапці — «Як у системі»
  (світла/темна за системою, за замовчуванням), «Світла» (`light`), «Темна» (`dark`), «Койот» (`sand`).
  Вибір запам'ятовується в браузері. Застосунок бере з тем лише кольори (`src/styles.css` →
  токени k2). Оновити теми: `cd packages/k2-styles && git fetch --tags && git checkout <тег>`, коміт.
- **Живі оновлення**: нове чи змінене іншим користувачем одразу з'являється в усіх відкритих
  вкладках (SSE `/api/events` + Postgres LISTEN/NOTIFY — працює й коли подів кілька).
- **Кеш і нові версії (Cloudflare)**: `index.html` і всі сторінки SPA віддаються з `Cache-Control: no-store`,
  тож після викатки Cloudflare й браузер одразу беруть нову збірку; файли `/assets/*` (з хешем у назві) —
  `immutable` на рік; `/api/*` і `/auth/*` — `no-store` (дані не осідають у кеші CDN навіть з «Cache Everything»);
  неіснуючий `/assets/*` — 404, а не `index.html`. Кожна збірка фронту має свій id (`dist/version.json`,
  можна задати `BUILD_ID`); сервер віддає його в заголовку `X-App-Build`. Відкрита вкладка зі старою збіркою
  показує «Вийшла нова версія» і перезавантажується при наступному переході на іншу сторінку (незбережену
  форму посеред набору не чіпає). Окремо налаштовувати чи чистити кеш у Cloudflare не треба.
- **Вхід через Keycloak**: лише сторінка Keycloak (Code + PKCE S256); власної форми з паролем
  (password grant) немає — у realm `k2` ROPC дозволено тільки K2 Auth. Сесія — кука `sid`, дані сесії в Postgres (таблиця `sessions`), живе `SESSION_MAX_HOURS`
  від входу і не подовжується. Brute-force захист — на боці Keycloak.
- **Перегляд без входу**: списки договорів і поставок, пошук, фільтри, картка договору й файли доступні
  анонімно; у шапці — кнопка «Увійти». Створення, редагування, видалення, поставки й недопоставки — лише
  після входу (API без входу відповідає `401`, форми змін ведуть на вхід). Журнал — як і раніше, лише
  адміністратору. `ANONYMOUS_READ=false` — вимкнути анонімний перегляд (усе лише після входу).
- **Журнал дій** (сторінка «Журнал», на договорі — «Історія»): хто, коли, з якої IP і що зробив.
  Лише для адміністратора — роль користувача `gov-purchase-admin` у realm Keycloak (`ADMIN_ROLE`, кілька — через кому); у dev-realm вона в `dev`, в `operator` — ні.
  - усі зміни даних — створення/редагування/видалення договору, файл договору, недопоставка, додавання й
    видалення поставок — з описом людською мовою і знімками «до/після»; для видалень — повний знімок
    видаленого (договір з найменуваннями й поставками), щоб його можна було відновити вручну;
  - запис журналу комітиться в тій самій транзакції, що й зміна;
  - невдалі спроби змін (422/404/500…) з тілом запиту й відповіддю сервера;
  - вхід, невдалий вхід, вихід; відкриття файлів;
  - кліки по кнопках/посиланнях і переходи між сторінками (значення полів форм не збираються);
  - `audit_log` лише доповнюється (тригер забороняє UPDATE/DELETE); кожен запис має `trace_id`.
- **Логи**: структурований JSON (pino) у stdout — кожен HTTP-запит, кожна дія з журналу, помилки й
  повільні SQL-запити. У кожному рядку `trace_id`, `span_id`, `user`, `req.id` (заголовок `X-Request-Id`).
- **OpenTelemetry → Elastic APM** (як у litopys): трейси (HTTP, Express, Nest, PostgreSQL) і метрики
  (зокрема Node runtime) через OTLP/HTTP. Транзакції позначені користувачем (`labels.enduser_*`),
  HTTP-заголовки — в атрибутах (cookie/authorization замасковано), тіла записів — за `OTEL_CAPTURE_BODY`.

## Структура

```
apps/api         NestJS: REST API під /api, роздає зібраний фронт у продакшені
  src/auth       вхід через Keycloak (OIDC), сесії в Postgres, глобальний AuthGuard
  src/audit      журнал дій: AuditService (записи з сервісів у транзакції), невдалі спроби, кліки з браузера
  src/logging    pino-логер, логер TypeORM
  src/telemetry  OpenTelemetry → Elastic APM (telemetry.ts імпортується в main.ts одразу після env.ts)
apps/web         React + Vite
packages/shared  TypeScript-типи контракту API, спільні для бекенду і фронту
packages/k2-styles  git-сабмодуль: теми К-2 (https://github.com/ArcKos00/k2-styles)
deploy.yaml      Kubernetes (ConfigMap, PVC, Deployment, Service, Ingress)
docker-compose.dev.yml  Postgres + Keycloak для розробки
.run/            run configurations WebStorm
```

## Запуск

### Docker Compose (застосунок + PostgreSQL)

```bash
docker compose up --build
```

Відкрийте http://localhost:3000 — без Keycloak (`AUTH_DISABLED=true`), усе від dev-користувача.

### Розробка

Потрібні Node.js 22.12+ (краще 24) і Docker.

```bash
git submodule update --init              # теми К-2 (packages/k2-styles); або клонувати з --recurse-submodules
npm install
cp apps/api/.env.example apps/api/.env   # значення вже під docker-compose.dev.yml
npm run db:up                            # Postgres :5442 (бази orders і orders_test) + Keycloak :8081
npm run dev -w apps/api                  # API на :3000 (або dev:debug — з дебагером на 9229)
npm run dev:web                          # фронт на http://localhost:5173 (проксі /api, /auth → :3000)
```

Вхід: `dev` / `dev` або `operator` / `operator` (realm `purchase`, `docker/keycloak/realm.json`);
адмінка Keycloak — http://localhost:8081 (`admin` / `admin`). Без Keycloak: `AUTH_DISABLED=true`.
`npm run db:down` — зупинити, `npm run db:reset` — з нуля (дані бази зітруться).

**WebStorm**: готові run configurations лежать у `.run/` і підхоплюються самі:

| Конфігурація | Що робить |
|---|---|
| `all: dev (db + keycloak, api 9229, web)` | усе разом: compose, API з дебагером, Vite |
| `db: docker compose (postgres :5442 + keycloak :8081)` | лише оточення |
| `api: dev (debug 9229)` / `api: dev без Keycloak (AUTH_DISABLED)` | API у watch-режимі |
| `web: dev (:5173)` | фронт |
| `attach: api 9229 + web` | під'єднати дебагер до API і відкрити браузер у режимі налагодження |
| `api: тести (jest, база orders_test)` · `typecheck (api + web)` | перевірки |

Змінні API читаються з `apps/api/.env` (у `.gitignore`); змінні оточення мають перевагу.
Таблиці створюються міграціями автоматично при старті API.
Завантажені файли зберігаються в `apps/api/data/uploads`.

## Налаштування

| Змінна | Призначення |
|---|---|
| `DATABASE_URL` | PostgreSQL |
| `KEYCLOAK_ISSUER`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET` | realm і клієнт Keycloak (confidential, Standard flow + PKCE S256; Direct Access Grants вимкнено) |
| `PUBLIC_URL` | адреса, яку бачить браузер: redirect URI = `PUBLIC_URL/auth/callback`; `https` → Secure-кука |
| `SESSION_SECRET` | ключ підпису кукі `sid` (`openssl rand -hex 32`), сталий між викатками |
| `SESSION_MAX_HOURS` | скільки живе один вхід, год (12) |
| `AUTH_DISABLED` | `true` — без Keycloak (лише розробка; при `NODE_ENV=production` заборонено) |
| `TRUST_PROXY` | кому вірити в `X-Forwarded-For` (`loopback, linklocal, uniquelocal`) |
| `LOG_LEVEL` | `debug` / `info` / `warn` / `error`; на `debug` логуються всі SQL-запити |
| `LOG_PRETTY` | `true` — людиночитні логи (лише локально, потрібен dev-пакет pino-pretty) |
| `SLOW_QUERY_MS` | поріг повільного SQL-запиту, мс (1000) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` або `ELASTIC_APM_SERVER_URL` | адреса Elastic APM Server / OTel Collector; порожньо — телеметрію вимкнено |
| `OTEL_EXPORTER_OTLP_HEADERS` або `ELASTIC_APM_SECRET_TOKEN` | авторизація до APM (у кластері не потрібна) |
| `OTEL_CAPTURE_HEADERS` | усі HTTP-заголовки в атрибути спанів, cookie/authorization маскуються (`true`) |
| `OTEL_CAPTURE_BODY` | тіла POST/PUT/DELETE у трейсах (тіло входу `/auth/*` — ніколи) |
| `OTEL_SERVICE_NAME`, `ELASTIC_APM_ENVIRONMENT`, `APP_VERSION` | назва сервісу, оточення і версія в APM |

Решта стандартних змінних `OTEL_*` (`OTEL_TRACES_SAMPLER`, `OTEL_RESOURCE_ATTRIBUTES`, …) теж працює.

### Продакшен-збірка без Docker

```bash
npm run build
DATABASE_URL=... npm start   # http://localhost:3000
```

## API

Усе під `/api`, крім `/api/health*`, вимагає входу (інакше `401`).

| Метод | Шлях | Що робить |
|---|---|---|
| POST / GET | `/auth/login` | вхід формою (JSON `username`, `password`) / через сторінку Keycloak |
| GET | `/auth/callback` | повернення з Keycloak (redirect URI клієнта) |
| GET | `/auth/me` · POST `/auth/logout` | хто увійшов · вихід |
| GET | `/api/health`, `/api/health/ready` | liveness / readiness (з перевіркою БД) |
| GET | `/api/contracts?q=&number=&counterparty=&item=&dateFrom=&dateTo=&status=&page=&pageSize=` | пошук договорів (по 25, до 100 на сторінку) |
| GET | `/api/deliveries?q=&invoice=&number=&counterparty=&item=&dateFrom=&dateTo=&page=&pageSize=` | усі поставки з пошуком |
| GET | `/api/events` | живі оновлення (SSE): `{type:'contract', action, contractId}` після кожної зміни |
| GET | `/api/contracts/:id` | договір з найменуваннями та поставками |
| POST | `/api/contracts` | створити договір |
| PUT | `/api/contracts/:id` | змінити договір і найменування |
| DELETE | `/api/contracts/:id` | видалити договір (разом із поставками й файлами) |
| PUT / DELETE | `/api/contracts/:id/file` | завантажити / прибрати файл договору (multipart, поле `file`) |
| PUT | `/api/contracts/:id/shortfall` | недопоставка ("не зможуть") і орієнтовна дата |
| POST | `/api/contracts/:id/deliveries` | додати поставку (multipart: `data` — JSON, `file` — скан накладної) |
| DELETE | `/api/deliveries/:id` | видалити поставку |
| GET | `/api/files/:id` | завантажити файл |
| GET | `/api/audit?kind=&actor=&contractId=&dateFrom=&dateTo=&before=` | журнал дій (по 100, курсор `before`) |
| POST | `/api/audit/events` | кліки й переходи з браузера |

Помилки валідації — `422` з `{ errors: { "items.0.quantity": "..." } }`; ключ `_` — загальна помилка.

## Перевірки

```bash
npm run typecheck
npm test   # база з TEST_DATABASE_URL (apps/api/.env), типово orders_test з docker-compose.dev.yml
```

Тести API працюють з окремою базою, яку **повністю очищують** перед запуском.
Корисний запит до журналу дій:

```sql
SELECT at, actor, ip, action, success, contract_id, summary, trace_id
FROM audit_log WHERE source = 'api' ORDER BY id DESC LIMIT 50;
```

Журнал попередньої версії (вхід `admin:admin`), якщо її викатували, — у таблиці `audit_log_v1`.

## Зміни схеми БД

Міграції — у `apps/api/src/database/migrations` (TypeORM). Нову міграцію додайте туди ж
і підключіть у `database.module.ts`.
