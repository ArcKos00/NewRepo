import { Logger as NestLogger } from '@nestjs/common';
import type { Logger, QueryRunner } from 'typeorm';
import { config } from '../config';

/** TypeORM → загальний логер: помилки запитів, повільні запити, міграції. */
export class TypeOrmLogger implements Logger {
  private readonly logger = new NestLogger('TypeORM');

  logQuery(query: string, parameters?: unknown[]) {
    this.logger.debug({ query, parameters }, 'query');
  }

  logQueryError(error: string | Error, query: string, parameters?: unknown[]) {
    this.logger.error({ err: error, query, parameters }, 'Помилка запиту до БД');
  }

  logQuerySlow(time: number, query: string, parameters?: unknown[]) {
    this.logger.warn({ durationMs: time, query, parameters }, `Повільний запит (${time} мс)`);
  }

  logSchemaBuild(message: string) {
    this.logger.log(message);
  }

  logMigration(message: string) {
    this.logger.log(message);
  }

  log(level: 'log' | 'info' | 'warn', message: unknown, _qr?: QueryRunner) {
    if (level === 'warn') this.logger.warn(message);
    else this.logger.log(message);
  }
}

export const typeOrmLogging = {
  logger: new TypeOrmLogger(),
  // Тексти всіх запитів — лише на рівні debug, інакше тільки помилки/міграції/попередження.
  logging: config.logLevel === 'debug' || config.logLevel === 'trace'
    ? ('all' as const)
    : (['error', 'warn', 'migration', 'schema'] as ('error' | 'warn' | 'migration' | 'schema')[]),
  maxQueryExecutionTime: config.slowQueryMs,
};
