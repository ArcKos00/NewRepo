import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import session from 'express-session';
import { Pool } from 'pg';
import { config } from '../config';

/**
 * Сесії в Postgres (таблиця sessions): викатка нового пода нікого не викидає на логін.
 * Сесія не подовжується (rolling вимкнено) — живе SESSION_MAX_HOURS від входу.
 */
@Injectable()
export class PgSessionStore extends session.Store implements OnApplicationShutdown {
  private readonly log = new Logger(PgSessionStore.name);
  private readonly pool = new Pool({ connectionString: config.databaseUrl, max: 3 });
  private readonly prune = setInterval(() => void this.removeExpired(), 15 * 60_000).unref();

  override get(sid: string, cb: (err: unknown, s?: session.SessionData | null) => void) {
    this.pool
      .query<{ sess: session.SessionData }>('SELECT sess FROM sessions WHERE sid = $1 AND expires_at > now()', [sid])
      .then((r) => cb(null, r.rows[0]?.sess ?? null), cb);
  }

  override set(sid: string, sess: session.SessionData, cb?: (err?: unknown) => void) {
    const expires = sess.cookie?.expires
      ? new Date(sess.cookie.expires)
      : new Date(Date.now() + config.sessionMaxHours * 3_600_000);
    this.pool
      .query(
        `INSERT INTO sessions (sid, sess, expires_at) VALUES ($1, $2, $3)
         ON CONFLICT (sid) DO UPDATE SET sess = EXCLUDED.sess, expires_at = EXCLUDED.expires_at`,
        [sid, JSON.stringify(sess), expires],
      )
      .then(() => cb?.(), (e) => cb?.(e));
  }

  override destroy(sid: string, cb?: (err?: unknown) => void) {
    this.pool.query('DELETE FROM sessions WHERE sid = $1', [sid]).then(() => cb?.(), (e) => cb?.(e));
  }

  override touch(_sid: string, _sess: session.SessionData, cb?: () => void) {
    cb?.();
  }

  private async removeExpired() {
    await this.pool.query('DELETE FROM sessions WHERE expires_at <= now()').catch((e) =>
      this.log.warn(`Не вдалося прибрати прострочені сесії: ${(e as Error).message}`),
    );
  }

  async onApplicationShutdown() {
    clearInterval(this.prune);
    await this.pool.end();
  }
}
