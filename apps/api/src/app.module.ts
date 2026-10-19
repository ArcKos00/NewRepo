import { Module } from '@nestjs/common';
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

@Module({
  imports: [LoggerModule, DatabaseModule, AuthModule, AuditModule, EventsModule],
  controllers: [HealthController, ContractsController, DeliveriesController, FilesController, PoolController],
  providers: [ContractsService, DeliveriesService, FilesService, PoolService, TelemetryShutdown],
})
export class AppModule {}
