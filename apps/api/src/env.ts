import fs from 'node:fs';
import path from 'node:path';
import tls from 'node:tls';

/**
 * Локальна розробка: змінні з apps/api/.env (зразок — .env.example). Змінні, вже задані в оточенні,
 * мають перевагу. У контейнері файлу немає — усе приходить з ConfigMap/Secret.
 * Імпортується ПЕРШИМ у main.ts: телеметрія читає змінні під час свого імпорту.
 */
const file = path.resolve(process.env.ENV_FILE ?? '.env');
if (fs.existsSync(file)) process.loadEnvFile(file);

// NODE_USE_SYSTEM_CA=1 — довіряти сертифікатам ОС (внутрішній CA K2 для Keycloak кластера).
// Node читає цю змінну лише на старті процесу, а з .env вона приходить пізніше — тож вмикаємо самі.
if (process.env.NODE_USE_SYSTEM_CA === '1') {
  tls.setDefaultCACertificates([...new Set([...tls.getCACertificates('default'), ...tls.getCACertificates('system')])]);
}
