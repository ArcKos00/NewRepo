// ПЕРШИМ: OpenTelemetry має пропатчити http/express/nest/pg до їх завантаження (без ендпоінта — нічого не робить)
import './telemetry';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { assertConfig, config } from './config';
import { setupApp } from './setup';

async function bootstrap() {
  assertConfig();
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  setupApp(app);
  await app.listen(config.port);
  console.log(`Order tracking API: http://localhost:${config.port}/api`);
}

void bootstrap();
