import { INestApplication, RequestMethod } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import session from 'express-session';
import { Logger } from 'nestjs-pino';
import { config } from './config';
import { validationPipe } from './common/validation';
import { PgSessionStore } from './auth/pg-session.store';
import { serveWeb } from './web';

/** Спільне налаштування для main.ts і тестів. */
export function setupApp(app: INestApplication) {
  app.useLogger(app.get(Logger));
  // За ingress: req.ip — адреса клієнта з X-Forwarded-For, req.secure — з X-Forwarded-Proto (лише від довірених проксі).
  (app as NestExpressApplication).set('trust proxy', config.trustProxy);
  app.setGlobalPrefix('api', { exclude: [{ path: 'auth/{*path}', method: RequestMethod.ALL }] });
  app.useGlobalPipes(validationPipe);
  // Фронт (якщо зібрано) і заголовки кешу — до сесії: статиці сесія не потрібна.
  serveWeb(app as NestExpressApplication);

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
