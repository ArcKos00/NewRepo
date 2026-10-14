import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import type { AuditEntry, AuditKind, AuditPage, AuditSource } from '@order-tracking/shared';
import { AuditLog } from '../database/entities';
import { searchText } from '../common/text';
import type { AuditContext } from './audit-context';
import type { AuditSearchDto } from './dto';

export interface AuditRecord {
  action: string;
  summary: string;
  success?: boolean;
  source?: AuditSource;
  entityType?: string | null;
  entityId?: number | null;
  contractId?: number | null;
  details?: unknown;
}

const PAGE_SIZE = 50;

/** Які дії входять у групу фільтра журналу. */
const KIND_SQL: Record<AuditKind, string> = {
  changes: `a.source = 'api' AND a.success AND (a.action LIKE 'contract.%' OR a.action LIKE 'delivery.%')`,
  deletes: `a.source = 'api' AND (a.action LIKE '%.delete' OR a.action = 'contract.file.remove')`,
  failed: `NOT a.success`,
  files: `a.action = 'file.download'`,
  ui: `a.source = 'ui'`,
};

@Injectable()
export class AuditService {
  private readonly log = new Logger('Audit');

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /**
   * Пише запис журналу. Для зміни даних передавайте `em` транзакції: тоді запис і зміна
   * комітяться разом — не буде ні зміни без запису, ні запису про зміну, якої не сталося.
   */
  async record(em: EntityManager | null, ctx: AuditContext, r: AuditRecord): Promise<void> {
    await this.recordMany(em, ctx, [r]);
  }

  async recordMany(em: EntityManager | null, ctx: AuditContext, list: AuditRecord[]): Promise<void> {
    if (!list.length) return;
    const rows = list.map((r) => ({
      source: r.source ?? 'api',
      action: r.action,
      success: r.success ?? true,
      actorId: ctx.actorId,
      actor: ctx.actor,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      tabId: ctx.tabId,
      traceId: ctx.traceId,
      entityType: r.entityType ?? null,
      entityId: r.entityId ?? null,
      contractId: r.contractId ?? null,
      summary: r.summary,
      details: (r.details ?? null) as object | null,
    }));
    await (em ?? this.ds.manager).insert(AuditLog, rows);
    // Дублюємо в лог пода (лише серверні дії, без кліків): видно в kubectl logs / Elastic навіть без БД.
    for (const row of rows)
      if (row.source === 'api')
        this.log.log(
          {
            audit: row.action, ok: row.success, actor: row.actor, actorId: row.actorId, ip: row.ip,
            contractId: row.contractId, entity: row.entityType && `${row.entityType}:${row.entityId}`,
          },
          row.summary,
        );
  }

  /** Запис, що не має зірвати основну дію (завантаження файлу, невдала спроба): помилку лише логуємо. */
  async recordSafe(ctx: AuditContext, r: AuditRecord): Promise<void> {
    await this.record(null, ctx, r).catch((e) =>
      this.log.error(`Не вдалося записати в журнал ${r.action}: ${(e as Error).message}`),
    );
  }

  async search(f: AuditSearchDto): Promise<AuditPage> {
    const qb = this.ds.manager.createQueryBuilder(AuditLog, 'a');
    if (f.kind) qb.andWhere(KIND_SQL[f.kind]);
    if (f.contractId) qb.andWhere('a.contract_id = :cid', { cid: Number(f.contractId) });
    if (f.actor?.trim()) {
      const like = `%${searchText(f.actor).replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
      qb.andWhere('(UPPER(a.actor) LIKE :actor OR a.ip LIKE :actor)', { actor: like });
    }
    // Межі дня — за київським часом, як їх бачить користувач.
    if (f.dateFrom) qb.andWhere(`a.at >= CAST(CAST(:from AS date) AS timestamp) AT TIME ZONE 'Europe/Kyiv'`, { from: f.dateFrom });
    if (f.dateTo) qb.andWhere(`a.at < CAST(CAST(:to AS date) + 1 AS timestamp) AT TIME ZONE 'Europe/Kyiv'`, { to: f.dateTo });
    const page = f.page ?? 1;
    const pageSize = f.pageSize ?? PAGE_SIZE;
    const [rows, total] = await qb
      .orderBy('a.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    return { entries: rows.map(view), total, page, pageSize };
  }
}

function view(a: AuditLog): AuditEntry {
  return {
    id: Number(a.id),
    at: a.at.toISOString(),
    source: a.source,
    action: a.action,
    success: a.success,
    actorId: a.actorId,
    actor: a.actor,
    ip: a.ip,
    userAgent: a.userAgent,
    tabId: a.tabId,
    traceId: a.traceId,
    entityType: a.entityType,
    entityId: a.entityId,
    contractId: a.contractId,
    summary: a.summary,
    details: a.details,
  };
}
