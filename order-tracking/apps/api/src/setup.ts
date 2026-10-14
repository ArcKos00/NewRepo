import { INestApplication, RequestMethod } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import session from 'express-session';
import { config } from './config';
import { validationPipe } from './common/validation';
import { PgSessionStore } from './auth/pg-session.store';

/** Спільне налаштування для main.ts і тестів. */
export function setupApp(app: INestApplication) {
  // Один проксі попереду (haproxy ingress): req.ip — адреса клієнта, req.secure — з X-Forwarded-Proto.
  (app as NestExpressApplication).set('trust proxy', 1);
  app.setGlobalPrefix('api', { exclude: [{ path: 'auth/{*path}', method: RequestMethod.ALL }] });
  app.useGlobalPipes(validationPipe);

  if (!config.authDisabled) {
    app.use(
      session({
        name: 'sid',
        store: app.get(PgSessionStore),
        secret: config.sessionSecret,
        resave: false,
        saveUninitialized: false,
        rolling: false,
        // Кука живе рівно стільки, скільки дозволено одному входу, і не подовжується.
        cookie: {
          httpOnly: true,
          sameSite: 'lax',
          secure: config.publicUrl.startsWith('https://'),
          maxAge: config.sessionMaxHours * 3_600_000,
        },
      }),
    );
  }
}
