import fs from 'node:fs';
import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { config } from './config';
import { DatabaseModule } from './database/database.module';
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
  imports: [DatabaseModule, ...staticFront],
  controllers: [ContractsController, DeliveriesController, FilesController],
  providers: [ContractsService, DeliveriesService, FilesService],
})
export class AppModule {}
