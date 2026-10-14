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

Потрібні Node.js 20+ і PostgreSQL з базою `orders`.

```bash
npm install
DATABASE_URL=postgres://postgres:postgres@localhost:5432/orders npm run dev:api   # API на :3000
npm run dev:web                                                                   # фронт на :5173 (проксі /api → :3000)
```

Таблиці створюються міграціями автоматично при старті API.
Завантажені файли зберігаються в `data/uploads` (див. `.env.example`).

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

Помилки валідації — `422` з `{ errors: { "items.0.quantity": "..." } }`; ключ `_` — загальна помилка.

## Перевірки

```bash
npm run typecheck
createdb orders_test
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/orders_test npm test
```

Тести API працюють з окремою базою, яку **повністю очищують** перед запуском.

## Зміни схеми БД

Міграції — у `apps/api/src/database/migrations` (TypeORM). Нову міграцію додайте туди ж
і підключіть у `database.module.ts`.
