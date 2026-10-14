import fs from 'node:fs';
import path from 'node:path';

/**
 * Локальна розробка: змінні з apps/api/.env (зразок — .env.example). Змінні, вже задані в оточенні,
 * мають перевагу. У контейнері файлу немає — усе приходить з ConfigMap/Secret.
 * Імпортується ПЕРШИМ у main.ts: телеметрія читає змінні під час свого імпорту.
 */
const file = path.resolve(process.env.ENV_FILE ?? '.env');
if (fs.existsSync(file)) process.loadEnvFile(file);
