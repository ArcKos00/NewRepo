import fs from 'node:fs';
import { Module, OnApplicationShutdown } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { config } from './config';
import { shutdownTelemetry } from './telemetry';
import { LoggerModule } from './logging/logger.module';
import { DatabaseModule } from './database/database.module';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { AuditInterceptor } from './audit/audit.interceptor';
import { HealthController } from './health/health.controller';
import { ContractsController } from './contracts/contracts.controller';
import { ContractsService } from './contracts/contracts.service';
import { DeliveriesController } from './deliveries/deliveries.controller';
import { DeliveriesService } from './deliveries/deliveries.service';
import { FilesController } from './files/files.controller';
import { FilesService } from './files/files.service';

// Якщо фронт зібрано (apps/web/dist) — роздаємо його тим самим сервером.
const staticFront = fs.existsSync(config.webDist)
  ? [ServeStaticModule.forRoot({ rootPath: config.webDist, exclude: ['/api/{*path}'] })]
  : [];

@Module({
  imports: [LoggerModule, DatabaseModule, ...staticFront],
  controllers: [HealthController, AuthController, ContractsController, DeliveriesController, FilesController],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    ContractsService,
    DeliveriesService,
    FilesService,
  ],
})
export class AppModule implements OnApplicationShutdown {
  async onApplicationShutdown() {
    await shutdownTelemetry();
  }
}
