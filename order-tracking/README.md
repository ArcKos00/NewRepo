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
- **Пошук**: за номером договору, контрагентом, найменуванням, періодом дати договору
  та станом (очікується / частково поставлено / прострочено / виконано). Без урахування
  регістру, зокрема для кирилиці. Фільтри зберігаються в адресі сторінки.

- **Вхід через Keycloak** (як у litopys): власна форма входу (password grant) або сторінка Keycloak
  (Code + PKCE). Сесія — кука `sid`, дані сесії в Postgres (таблиця `sessions`), живе `SESSION_MAX_HOURS`
  від входу і не подовжується. Без входу API відповідає `401`.
- **Журнал дій** (сторінка «Журнал», на договорі — «Історія»): хто, коли, з якої IP і що зробив.
  - усі зміни даних — створення/редагування/видалення договору, файл договору, недопоставка, додавання й
    видалення поставок — з описом людською мовою і знімками «до/після»; для видалень — повний знімок
    видаленого (договір з найменуваннями й поставками), щоб його можна було відновити вручну;
  - запис журналу комітиться в тій самій транзакції, що й зміна;
  - невдалі спроби змін (422/404/500…) з тілом запиту й відповіддю сервера;
  - вхід, невдалий вхід, вихід; відкриття файлів;
  - кліки по кнопках/посиланнях і переходи між сторінками (значення полів форм не збираються);
  - `audit_log` лише доповнюється (тригер забороняє UPDATE/DELETE); кожен серверний запис дублюється
    рядком `[Audit] {...}` у лог пода і має `traceId` для переходу до трейсу в APM.
- **OpenTelemetry → Elastic APM** (як у litopys): трейси й метрики по OTLP/HTTP; http, express, Nest, pg.
  Вмикається змінною `ELASTIC_APM_SERVER_URL` (+ `ELASTIC_APM_SECRET_TOKEN`), див. `.env.example`.
  Транзакції позначені користувачем (`labels.enduser_id`, `labels.enduser_name`).

## Структура

```
apps/api         NestJS: REST API під /api, роздає зібраний фронт у продакшені
apps/web         React + Vite
packages/shared  TypeScript-типи контракту API, спільні для бекенду і фронту
```

## Запуск

### Docker Compose (застосунок + PostgreSQL)

```bash
docker compose up --build
```

Відкрийте http://localhost:3000.

### Розробка

Потрібні Node.js 22.12+ (краще 24) і Docker.

```bash
npm install
cp apps/api/.env.example apps/api/.env   # значення вже під docker-compose.dev.yml
npm run db:up                            # Postgres :5442 (бази orders і orders_test) + Keycloak :8081
npm run dev -w apps/api                  # API на :3000 (або dev:debug — з дебагером на 9229)
npm run dev:web                          # фронт на http://localhost:5173 (проксі /api, /auth → :3000)
```

Вхід: `dev` / `dev` або `operator` / `operator` (realm `purchase`, `docker/keycloak/realm.json`);
адмінка Keycloak — http://localhost:8081 (`admin` / `admin`). Без Keycloak: `AUTH_DISABLED=true`.
`npm run db:down` — зупинити, `npm run db:reset` — з нуля (дані бази зітруться).

**WebStorm**: готові run configurations лежать у `.run/` у корені репозиторію й підхоплюються самі:

| Конфігурація | Що робить |
|---|---|
| `all: dev (db + keycloak, api 9229, web)` | усе разом: compose, API з дебагером, Vite |
| `db: docker compose (postgres :5442 + keycloak :8081)` | лише оточення |
| `api: dev (debug 9229)` / `api: dev без Keycloak (AUTH_DISABLED)` | API у watch-режимі |
| `web: dev (:5173)` | фронт |
| `attach: api 9229 + web` | під'єднати дебагер до API і відкрити браузер у режимі налагодження |
| `api: тести (jest, база orders_test)` · `typecheck (api + web)` | перевірки |

Змінні API читаються з `apps/api/.env` (файл у `.gitignore`); змінні оточення мають перевагу.
Таблиці створюються міграціями автоматично при старті API.
Завантажені файли зберігаються в `apps/api/data/uploads`.

### Продакшен-збірка без Docker

```bash
npm run build
DATABASE_URL=... npm start   # http://localhost:3000
```

## API

| Метод | Шлях | Що робить |
|---|---|---|
| GET | `/api/contracts?number=&counterparty=&item=&dateFrom=&dateTo=&status=` | пошук |
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
| POST / GET | `/auth/login` | вхід формою (JSON `username`, `password`) / через сторінку Keycloak |
| GET | `/auth/callback` | повернення з Keycloak (redirect URI клієнта) |
| GET | `/auth/me` · POST `/auth/logout` | хто увійшов · вихід |

Помилки валідації — `422` з `{ errors: { "items.0.quantity": "..." } }`; ключ `_` — загальна помилка.

## Перевірки

```bash
npm run typecheck
npm test   # база з TEST_DATABASE_URL (apps/api/.env), типово orders_test з docker-compose.dev.yml
```

Тести API працюють з окремою базою, яку **повністю очищують** перед запуском.

## Зміни схеми БД

Міграції — у `apps/api/src/database/migrations` (TypeORM). Нову міграцію додайте туди ж
і підключіть у `database.module.ts`.
