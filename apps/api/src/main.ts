// telemetry — першим: інструментації мають пропатчити модулі до їх завантаження.
import './telemetry';
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config } from './config';
import { setupApp } from './setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  setupApp(app);
  await app.listen(config.port);
  new Logger('Bootstrap').log(`Order tracking API: http://localhost:${config.port}/api`);
}

bootstrap().catch((err) => {
  new Logger('Bootstrap').error({ err }, 'Не вдалося запустити застосунок');
  process.exit(1);
});
