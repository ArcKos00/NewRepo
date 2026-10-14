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
- **Вхід**: один користувач із `AUTH_USERNAME` / `AUTH_PASSWORD`. Сесія — підписана httpOnly-cookie
  (`SameSite=Strict`), після `MAX_FAILED_LOGINS` невдалих спроб з IP за 15 хв вхід блокується.
- **Журнал дій** (`audit_log` у БД): кожен запит користувача до API — хто, що (`action`, напр.
  `contract.create`), коли, результат і код відповіді, сутність, IP, параметри/тіло запиту (паролі
  замасковано), опис завантаженого файлу, текст помилки та `trace_id` для переходу в APM.
- **Логи**: структурований JSON (pino) у stdout — кожен HTTP-запит, бізнес-події (договір створено,
  поставку додано, …), невдалі входи, помилки й повільні SQL-запити. У кожному рядку `trace_id`,
  `span_id`, `user`, `req.id` (заголовок `X-Request-Id`).
- **OpenTelemetry → Elastic**: трейси (HTTP, Express, Nest, PostgreSQL), метрики (зокрема Node runtime)
  і логи через OTLP — напряму в Elastic APM Server або через OTel Collector.

## Структура

```
apps/api         NestJS: REST API під /api, роздає зібраний фронт у продакшені
  src/auth       вхід, сесія, глобальний AuthGuard
  src/audit      журнал дій (AuditInterceptor → audit_log)
  src/logging    pino-логер, логер TypeORM
  src/telemetry.ts  OpenTelemetry SDK (імпортується першим у main.ts)
apps/web         React + Vite
packages/shared  TypeScript-типи контракту API, спільні для бекенду і фронту
deploy.yaml      Kubernetes (ConfigMap, PVC, Deployment, Service, Ingress)
```

## Запуск

### Docker Compose (застосунок + PostgreSQL)

```bash
docker compose up --build
```

Відкрийте http://localhost:3000 і увійдіть як `admin` / `admin`.

### Розробка

Потрібні Node.js 20+ і PostgreSQL з базою `orders`.

```bash
npm install
cp .env.example .env    # set -a; . ./.env; set +a
npm run dev:api         # API на :3000
npm run dev:web         # фронт на :5173 (проксі /api → :3000)
```

Таблиці створюються міграціями автоматично при старті API.
Завантажені файли зберігаються в `data/uploads`. Усі змінні оточення — у `.env.example`.

## Налаштування

| Змінна | Призначення |
|---|---|
| `DATABASE_URL` | PostgreSQL |
| `AUTH_USERNAME`, `AUTH_PASSWORD` | логін і пароль єдиного користувача (`admin` / `admin`) |
| `SESSION_SECRET` | ключ підпису cookie (`openssl rand -hex 32`); без нього сесії скидаються при перезапуску |
| `SESSION_TTL_HOURS` | тривалість сесії, год (12) |
| `COOKIE_SECURE` | Secure-cookie (за замовчуванням — у продакшені) |
| `MAX_FAILED_LOGINS` | невдалих входів з IP за 15 хв до блокування (10) |
| `TRUST_PROXY` | кому вірити в `X-Forwarded-For` (`loopback, linklocal, uniquelocal`) |
| `LOG_LEVEL` | `debug` / `info` / `warn` / `error`; на `debug` логуються всі SQL-запити |
| `LOG_PRETTY` | `true` — людиночитні логи (лише локально, потрібен dev-пакет pino-pretty) |
| `SLOW_QUERY_MS` | поріг повільного SQL-запиту, мс (1000) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | адреса Elastic APM Server / OTel Collector; порожньо — телеметрію вимкнено |
| `OTEL_EXPORTER_OTLP_HEADERS` | заголовки до APM, напр. `Authorization=Bearer <token>` (у кластері не потрібен) |
| `OTEL_CAPTURE_HEADERS` | усі HTTP-заголовки в атрибути спанів, cookie/authorization маскуються (`true`) |
| `OTEL_SERVICE_NAME`, `APP_ENV`, `APP_VERSION` | назва сервісу, оточення і версія в APM |

Решта стандартних змінних `OTEL_*` (`OTEL_EXPORTER_OTLP_PROTOCOL`, `OTEL_TRACES_SAMPLER`,
`OTEL_LOGS_EXPORTER=none`, `OTEL_METRICS_EXPORTER=none`, …) теж працює.

### Продакшен-збірка без Docker

```bash
npm run build
DATABASE_URL=... npm start   # http://localhost:3000
```

## API

Усе, крім `/api/auth/login`, `/api/auth/logout` і `/api/health*`, вимагає входу (інакше `401`).

| Метод | Шлях | Що робить |
|---|---|---|
| POST | `/api/auth/login` | вхід `{ username, password }` → cookie сесії |
| POST | `/api/auth/logout` | вихід |
| GET | `/api/auth/me` | поточний користувач |
| GET | `/api/health`, `/api/health/ready` | liveness / readiness (з перевіркою БД) |
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

Помилки валідації — `422` з `{ errors: { "items.0.quantity": "..." } }`; ключ `_` — загальна помилка.

## Перевірки

```bash
npm run typecheck
createdb orders_test
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/orders_test npm test
```

Тести API працюють з окремою базою, яку **повністю очищують** перед запуском.
Корисний запит до журналу дій:

```sql
SELECT at, username, action, success, status_code, entity_type, entity_id, trace_id
FROM audit_log ORDER BY id DESC LIMIT 50;
```

## Зміни схеми БД

Міграції — у `apps/api/src/database/migrations` (TypeORM). Нову міграцію додайте туди ж
і підключіть у `database.module.ts`.
