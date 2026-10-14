import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseEnv } from 'node:util';

// З apps/api/.env беремо лише TEST_DATABASE_URL: решта (Keycloak, APM) тестам не потрібна.
const envFile = path.resolve(__dirname, '../.env');
const fileEnv = fs.existsSync(envFile) ? parseEnv(fs.readFileSync(envFile, 'utf8')) : {};

// Тести працюють з окремою БД, яку повністю очищують перед запуском.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? fileEnv.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5442/orders_test';
process.env.UPLOADS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'orders-uploads-'));
process.env.WEB_DIST = path.join(os.tmpdir(), 'no-web-dist');
// Тести API — без Keycloak: усі запити від dev-користувача.
process.env.AUTH_DISABLED = 'true';
process.env.OTEL_SDK_DISABLED = 'true';
