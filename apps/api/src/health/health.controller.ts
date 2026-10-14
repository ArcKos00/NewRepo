import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from '../auth/auth.guard';

/** Проби Kubernetes: без входу, без журналу, без спанів і логів запитів (див. telemetry.ts, logger.module.ts). */
@Public()
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /** liveness: процес живий */
  @Get()
  live() {
    return { status: 'ok' };
  }

  /** readiness: є з'єднання з БД */
  @Get('ready')
  async ready() {
    await this.ds.query('SELECT 1');
    return { status: 'ok' };
  }
}
