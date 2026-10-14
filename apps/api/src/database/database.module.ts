import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { config } from '../config';
import { entities } from './entities';
import { Init1759650000000 } from './migrations/1759650000000-Init';
import { AuditSessions1760400000000 } from './migrations/1760400000000-AuditSessions';
import { typeOrmLogging } from '../logging/typeorm-logger';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: config.databaseUrl,
      entities,
      migrations: [Init1759650000000, AuditSessions1760400000000],
      migrationsRun: true,
      synchronize: false,
      namingStrategy: new SnakeNamingStrategy(),
      ...typeOrmLogging,
    }),
    TypeOrmModule.forFeature(entities),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
