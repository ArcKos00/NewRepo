import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import type { ContractDetails, PoolAllocation as PoolAllocationView, PoolItem as PoolItemView, PoolList } from '@order-tracking/shared';
import { PoolAllocation, PoolItem } from '../database/entities';
import { likePattern as like, orNull, qty, round3, searchText, searchWords } from '../common/text';
import { fail } from '../common/validation';
import { AuditService } from '../audit/audit.service';
import { EventsService } from '../events/events.service';
import type { AuditContext } from '../audit/audit-context';
import { contractLabel, fmtDate, itemLine } from '../audit/describe';
import { ContractsService } from '../contracts/contracts.service';
import { PAGE_SIZE } from '../contracts/dto';
import { PoolContractDto, PoolItemDto, PoolSearchDto } from './dto';

const ALLOCATED_SQL = `COALESCE((SELECT SUM(a.quantity) FROM pool_allocations a WHERE a.pool_item_id = p.id), 0)`;
/** Стан у SQL — те саме, що statusOf() нижче (щоб фільтрувати до пагінації). */
const STATUS_SQL = `(CASE WHEN ${ALLOCATED_SQL} = 0 THEN 'unallocated'
  WHEN ${ALLOCATED_SQL} >= p.quantity THEN 'allocated' ELSE 'partial' END)`;

const statusOf = (quantity: number, allocated: number): PoolItemView['status'] =>
  allocated <= 0 ? 'unallocated' : allocated >= quantity ? 'allocated' : 'partial';

@Injectable()
export class PoolService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly contracts: ContractsService,
    private readonly audit: AuditService,
    private readonly live: EventsService,
  ) {}

  /** Записи з порахованим «розподілено» і договорами, куди пішли. */
  private async view(em: EntityManager, items: PoolItem[]): Promise<PoolItemView[]> {
    const rows: { pool_item_id: number; contract_id: number; number: string; counterparty: string; quantity: string }[] =
      items.length
        ? await em.query(
            `SELECT a.pool_item_id, c.id AS contract_id, c.number, c.counterparty, SUM(a.quantity) AS quantity
               FROM pool_allocations a
               JOIN order_items i ON i.id = a.order_item_id
               JOIN contracts c ON c.id = i.contract_id
              WHERE a.pool_item_id = ANY($1)
              GROUP BY a.pool_item_id, c.id
              ORDER BY MIN(a.id)`,
            [items.map((p) => p.id)],
          )
        : [];
    const allocations = new Map<number, PoolAllocationView[]>();
    for (const r of rows) {
      const list = allocations.get(r.pool_item_id) ?? [];
      list.push({ contractId: r.contract_id, number: r.number, counterparty: r.counterparty, quantity: Number(r.quantity) });
      allocations.set(r.pool_item_id, list);
    }
    return items.map((p) => {
      const list = allocations.get(p.id) ?? [];
      const allocated = round3(list.reduce((s, a) => s + a.quantity, 0));
      return {
        id: p.id,
        name: p.name,
        unit: p.unit,
        quantity: p.quantity,
        allocated,
        remaining: Math.max(0, round3(p.quantity - allocated)),
        status: statusOf(p.quantity, allocated),
        enteredOn: p.enteredOn,
        notes: p.notes,
        allocations: list,
      };
    });
  }

  // ---------- Перегляд і пошук ----------

  async search(f: PoolSearchDto): Promise<PoolList> {
    const qb = this.ds.manager.createQueryBuilder(PoolItem, 'p');
    searchWords(f.q).forEach((word, n) => qb.andWhere(`p.name_search LIKE :q${n}`, { [`q${n}`]: like(word) }));
    if (f.status) qb.andWhere(`${STATUS_SQL} = :status`, { status: f.status });
    if (f.dateFrom) qb.andWhere('p.entered_on >= :from', { from: f.dateFrom });
    if (f.dateTo) qb.andWhere('p.entered_on <= :to', { to: f.dateTo });

    const page = f.page ?? 1;
    const pageSize = f.pageSize ?? PAGE_SIZE;
    const [found, total] = await qb
      .orderBy('p.entered_on', 'DESC')
      .addOrderBy('p.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    return { items: await this.view(this.ds.manager, found), total, page, pageSize };
  }

  /** Усе з залишком > 0, за абеткою. */
  async available(): Promise<PoolItemView[]> {
    const found = await this.ds.manager
      .createQueryBuilder(PoolItem, 'p')
      .where(`${ALLOCATED_SQL} < p.quantity`)
      .orderBy('p.name_search')
      .addOrderBy('p.entered_on')
      .addOrderBy('p.id')
      .getMany();
    return this.view(this.ds.manager, found);
  }

  // ---------- Внесення / видалення ----------

  async create(dto: PoolItemDto, ctx: AuditContext): Promise<PoolItemView> {
    return this.ds.transaction(async (em) => {
      const p = await em.save(
        em.create(PoolItem, {
          name: dto.name.trim(),
          nameSearch: searchText(dto.name),
          unit: dto.unit.trim(),
          quantity: round3(dto.quantity),
          enteredOn: dto.enteredOn,
          notes: orNull(dto.notes),
        }),
      );
      const [after] = await this.view(em, [p]);
      await this.live.publish(em, { type: 'pool' });
      await this.audit.record(em, ctx, {
        action: 'pool.create',
        entityType: 'pool',
        entityId: p.id,
        summary: `Внесено в нерозподілене: ${itemLine(p, p.quantity)} (від ${fmtDate(p.enteredOn)})`,
        details: { after },
      });
      return after;
    });
  }

  async remove(id: number, ctx: AuditContext): Promise<void> {
    await this.ds.transaction(async (em) => {
      const p = await em.findOne(PoolItem, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!p) throw new NotFoundException('Запис не знайдено');
      const [before] = await this.view(em, [p]);
      if (before.allocations.length) fail({ _: 'Частину вже розподілено в договори — такий запис видалити не можна.' });
      await em.delete(PoolItem, { id });
      await this.live.publish(em, { type: 'pool' });
      await this.audit.record(em, ctx, {
        action: 'pool.delete',
        entityType: 'pool',
        entityId: id,
        summary: `Видалено з нерозподіленого: ${itemLine(p, p.quantity)} (від ${fmtDate(p.enteredOn)})`,
        details: { before },
      });
    });
  }

  // ---------- Договір з нерозподіленого ----------

  /**
   * Новий договір: кожен рядок — скільки взяти з нерозподіленого запису. Однакові найменування
   * (назва й од. виміру) стають одним рядком договору. Усе в одній транзакції із записами,
   * заблокованими від паралельного розподілу.
   */
  async createContract(dto: PoolContractDto, ctx: AuditContext): Promise<ContractDetails> {
    return this.ds.transaction(async (em) => {
      const errors = await this.contracts.checkCommon(em, dto);
      const ids = [...new Set(dto.lines.map((l) => l.poolItemId))];
      const locked = await em.find(PoolItem, { where: { id: In(ids) }, order: { id: 'ASC' }, lock: { mode: 'pessimistic_write' } });
      const pool = new Map((await this.view(em, locked)).map((p) => [p.id, p]));

      const taken = new Map<number, number>();
      dto.lines.forEach((line, i) => {
        const p = pool.get(line.poolItemId);
        if (!p) {
          errors._ = 'Частину найменувань уже видалено з нерозподіленого — оновіть сторінку.';
          return;
        }
        const total = round3((taken.get(p.id) ?? 0) + line.quantity);
        taken.set(p.id, total);
        if (total > p.remaining)
          errors[`lines.${i}.quantity`] = p.remaining > 0 ? `Залишилось лише ${qty(p.remaining)} ${p.unit}` : 'Уже повністю розподілено';
      });
      if (Object.keys(errors).length) fail(errors);

      // Рядки договору в порядку, як їх перетягували.
      const groups = new Map<string, { name: string; unit: string; quantity: number; parts: Map<number, number> }>();
      for (const line of dto.lines) {
        const p = pool.get(line.poolItemId)!;
        const key = `${searchText(p.name)}\u0000${searchText(p.unit)}`;
        const g = groups.get(key) ?? { name: p.name, unit: p.unit, quantity: 0, parts: new Map<number, number>() };
        g.quantity = round3(g.quantity + line.quantity);
        g.parts.set(p.id, round3((g.parts.get(p.id) ?? 0) + line.quantity));
        groups.set(key, g);
      }
      const rows = [...groups.values()];

      const { after, items } = await this.contracts.insert(
        em,
        {
          number: dto.number,
          counterparty: dto.counterparty,
          contractDate: dto.contractDate,
          expectedDeliveryDate: dto.expectedDeliveryDate,
          notes: dto.notes,
          items: rows.map(({ name, unit, quantity }) => ({ name, unit, quantity })),
        },
        ctx,
        'з нерозподіленого',
      );
      const allocations = rows.flatMap((g, i) =>
        [...g.parts].map(([poolItemId, quantity]) => em.create(PoolAllocation, { poolItemId, orderItemId: items[i].id, quantity })),
      );
      // Подія договору (created) уже є — клієнт за нею перечитає й нерозподілене.
      await em.save(allocations);

      await this.audit.record(em, ctx, {
        action: 'pool.allocate',
        entityType: 'contract',
        entityId: after.id,
        contractId: after.id,
        summary:
          `Розподілено в договір ${contractLabel(after)}: ` +
          [...taken].map(([id, q]) => `${itemLine(pool.get(id)!, q)} (запис від ${fmtDate(pool.get(id)!.enteredOn)})`).join('; '),
        details: { lines: [...taken].map(([id, q]) => ({ poolItemId: id, quantity: q, before: pool.get(id) })) },
      });
      return after;
    });
  }
}
