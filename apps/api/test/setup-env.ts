import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Тести працюють з окремою БД, яку повністю очищують перед запуском.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/orders_test';
process.env.UPLOADS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'orders-uploads-'));
process.env.WEB_DIST = path.join(os.tmpdir(), 'no-web-dist');
