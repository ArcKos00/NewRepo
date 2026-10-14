import crypto from 'node:crypto';
import path from 'node:path';

const env = process.env;
const production = env.NODE_ENV === 'production';

export const config = {
  production,
  port: Number(env.PORT ?? 3000),
  databaseUrl: env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/orders',
  uploadsDir: path.resolve(env.UPLOADS_DIR ?? 'data/uploads'),
  maxUploadMb: Number(env.MAX_UPLOAD_MB ?? 50),
  /** Каталог зібраного фронту (apps/web/dist), який Nest роздає в продакшені. */
  webDist: path.resolve(env.WEB_DIST ?? path.join(__dirname, '../../web/dist')),

  /** Кому вірити в X-Forwarded-For (express "trust proxy"). */
  trustProxy: env.TRUST_PROXY ?? 'loopback, linklocal, uniquelocal',

  /** trace | debug | info | warn | error | fatal */
  logLevel: env.LOG_LEVEL ?? 'info',
  /** Людиночитні логи замість JSON (лише для локальної розробки). */
  logPretty: env.LOG_PRETTY === 'true',
  /** Запити до БД, довші за цей поріг (мс), логуються як warn. */
  slowQueryMs: Number(env.SLOW_QUERY_MS ?? 1000),

  auth: {
    /** Єдиний користувач застосунку (за замовчуванням admin:admin). */
    username: env.AUTH_USERNAME || 'admin',
    password: env.AUTH_PASSWORD || 'admin',
    /**
     * Ключ підпису cookie сесії. Без нього генерується випадковий — тоді сесії
     * скидаються при кожному перезапуску.
     */
    sessionSecret: env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    sessionSecretGenerated: !env.SESSION_SECRET,
    sessionTtlHours: Number(env.SESSION_TTL_HOURS ?? 12),
    /** Secure-cookie: за замовчуванням увімкнено в продакшені (TLS на ingress). */
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : production,
    /** Невдалих спроб входу з однієї IP за 15 хвилин, після яких вхід блокується. */
    maxFailedLogins: Number(env.MAX_FAILED_LOGINS ?? 10),
  },
};
