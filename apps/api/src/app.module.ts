import fs from 'node:fs';
import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { config } from './config';
import { TelemetryShutdown } from './telemetry';
import { LoggerModule } from './logging/logger.module';
import { DatabaseModule } from './database/database.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { ContractsController } from './contracts/contracts.controller';
import { ContractsService } from './contracts/contracts.service';
import { DeliveriesController } from './deliveries/deliveries.controller';
import { DeliveriesService } from './deliveries/deliveries.service';
import { FilesController } from './files/files.controller';
import { FilesService } from './files/files.service';

// Якщо фронт зібрано (apps/web/dist) — роздаємо його тим самим сервером.
const staticFront = fs.existsSync(config.webDist)
  ? [ServeStaticModule.forRoot({ rootPath: config.webDist, exclude: ['/api/{*path}', '/auth/{*path}'] })]
  : [];

@Module({
  imports: [LoggerModule, DatabaseModule, AuthModule, AuditModule, ...staticFront],
  controllers: [HealthController, ContractsController, DeliveriesController, FilesController],
  providers: [ContractsService, DeliveriesService, FilesService, TelemetryShutdown],
})
export class AppModule {}
