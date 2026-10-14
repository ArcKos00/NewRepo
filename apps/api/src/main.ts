// ПЕРШИМ: змінні з .env (локальна розробка), далі OpenTelemetry має пропатчити http/express/nest/pg до їх завантаження (без ендпоінта — нічого не робить)
import './env';
import './telemetry';
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { assertConfig, config } from './config';
import { setupApp } from './setup';

async function bootstrap() {
  assertConfig();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.enableShutdownHooks();
  setupApp(app);
  await app.listen(config.port);
  new Logger('Bootstrap').log(`Order tracking API: http://localhost:${config.port}/api`);
}

bootstrap().catch((err) => {
  new Logger('Bootstrap').error({ err }, 'Не вдалося запустити застосунок');
  process.exit(1);
});
