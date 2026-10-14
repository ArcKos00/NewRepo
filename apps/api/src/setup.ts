import { INestApplication, Logger as NestLogger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';
import { config } from './config';
import { validationPipe } from './common/validation';

/** Спільне налаштування для main.ts і тестів. */
export function setupApp(app: INestApplication) {
  app.useLogger(app.get(Logger));
  // За ingress: справжня IP клієнта — з X-Forwarded-For, але лише від проксі з приватних мереж.
  (app as NestExpressApplication).set('trust proxy', config.trustProxy);
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(validationPipe);
  app.enableShutdownHooks();

  if (config.auth.sessionSecretGenerated)
    new NestLogger('Auth').warn('SESSION_SECRET не задано — сесії скинуться після перезапуску');
}
