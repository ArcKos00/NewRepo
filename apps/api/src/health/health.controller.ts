import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Audit } from '../audit/audit.decorator';
import { Public } from '../auth/public.decorator';

/** Проби Kubernetes: без входу, без журналу, без спанів (див. telemetry.ts). */
@Public()
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /** liveness: процес живий */
  @Get()
  @Audit(false)
  live() {
    return { status: 'ok' };
  }

  /** readiness: є з'єднання з БД */
  @Get('ready')
  @Audit(false)
  async ready() {
    await this.ds.query('SELECT 1');
    return { status: 'ok' };
  }
}
