import fs from 'node:fs';
import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { config } from './config';
import { TelemetryShutdown } from './telemetry';
import { LoggerModule } from './logging/logger.module';
import { DatabaseModule } from './database/database.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { EventsModule } from './events/events.module';
import { HealthController } from './health/health.controller';
import { ContractsController } from './contracts/contracts.controller';
import { ContractsService } from './contracts/contracts.service';
import { DeliveriesController } from './deliveries/deliveries.controller';
import { DeliveriesService } from './deliveries/deliveries.service';
import { FilesController } from './files/files.controller';
import { FilesService } from './files/files.service';
import { PoolController } from './pool/pool.controller';
import { PoolService } from './pool/pool.service';

// Якщо фронт зібрано (apps/web/dist) — роздаємо його тим самим сервером.
const staticFront = fs.existsSync(config.webDist)
  ? [ServeStaticModule.forRoot({ rootPath: config.webDist, exclude: ['/api/{*path}', '/auth/{*path}'] })]
  : [];

@Module({
  imports: [LoggerModule, DatabaseModule, AuthModule, AuditModule, EventsModule, ...staticFront],
  controllers: [HealthController, ContractsController, DeliveriesController, FilesController, PoolController],
  providers: [ContractsService, DeliveriesService, FilesService, PoolService, TelemetryShutdown],
})
export class AppModule {}
