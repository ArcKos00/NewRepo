
import { Body, Controller, Get, HttpCode, Post, Query, Req } from '@nestjs/common';
import type { AuditPage } from '@order-tracking/shared';
import type { SessionRequest } from '../auth/session';
import { auditContext } from './audit-context';
import { AuditRecord, AuditService } from './audit.service';
import { entityOfPath } from './audit.interceptor';
import { AuditSearchDto, UiEventBatchDto } from './dto';

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  search(@Query() query: AuditSearchDto): Promise<AuditPage> {
    return this.audit.search(query);
  }

  /** Кліки й переходи з браузера (пакетами; при закритті вкладки — sendBeacon). */
  @Post('events')
  @HttpCode(204)
  async events(@Req() req: SessionRequest, @Body() batch: UiEventBatchDto): Promise<void> {
    const ctx = auditContext(req, batch.tabId);
    const records: AuditRecord[] = batch.events.map((e) => {
      const { contractId } = entityOfPath(e.path);
      return {
        source: 'ui',
        action: `ui.${e.type}`,
        contractId,
        entityType: contractId ? 'contract' : null,
        entityId: contractId,
        summary: e.type === 'click' ? `Клік «${e.target ?? '?'}» на ${e.path}` : `Перехід на ${e.path}`,
        details: { path: e.path, target: e.target, href: e.href, clientAt: e.at },
      };
    });
    await this.audit.recordMany(null, ctx, records);
  }
}
