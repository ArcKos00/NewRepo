import path from 'node:path';

const truthy = (v: string | undefined) => v === 'true' || v === '1';
const production = process.env.NODE_ENV === 'production';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/orders',
  uploadsDir: path.resolve(process.env.UPLOADS_DIR ?? 'data/uploads'),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 50),
  /** Каталог зібраного фронту (apps/web/dist), який Nest роздає в продакшені. */
  webDist: path.resolve(process.env.WEB_DIST ?? path.join(__dirname, '../../web/dist')),

  // ---------- Вхід через Keycloak (як у litopys) ----------

  /** true — без Keycloak: усі запити від dev-користувача. У продакшені заборонено. */
  authDisabled: truthy(process.env.AUTH_DISABLED),
  /** Публічний issuer realm-у — рівно той рядок, що стоїть в `iss` токенів. */
  keycloakIssuer: process.env.KEYCLOAK_ISSUER ?? '',
  keycloakClientId: process.env.KEYCLOAK_CLIENT_ID ?? '',
  keycloakClientSecret: process.env.KEYCLOAK_CLIENT_SECRET ?? '',
  /** Адреса, яку бачить браузер: звідси redirect URI (`${publicUrl}/auth/callback`) і secure-кука. */
  publicUrl: (process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/+$/, ''),
  /** Підпис куки сесії. Має бути сталим між викатками, інакше всіх викине на логін. */
  sessionSecret: process.env.SESSION_SECRET ?? '',
  /** Скільки годин живе один вхід. Сесія не подовжується. */
  sessionMaxHours: Number(process.env.SESSION_MAX_HOURS ?? 12),
};

export function assertConfig() {
  if (config.authDisabled) {
    if (production) throw new Error('AUTH_DISABLED=true заборонено при NODE_ENV=production');
    return;
  }
  const missing = (
    [
      ['KEYCLOAK_ISSUER', config.keycloakIssuer],
      ['KEYCLOAK_CLIENT_ID', config.keycloakClientId],
      ['KEYCLOAK_CLIENT_SECRET', config.keycloakClientSecret],
      ['SESSION_SECRET', config.sessionSecret],
    ] as const
  ).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error(`Не задано: ${missing.join(', ')} (або AUTH_DISABLED=true для розробки)`);
}
