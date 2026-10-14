import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import type { ContractDetails, DeliveryList } from '@order-tracking/shared';
import { Contract, Delivery, DeliveryLine, OrderItem, StoredFile } from '../database/entities';
import { likePattern as like, orNull, qty, round3, searchText, searchWords, today } from '../common/text';
import { fail } from '../common/validation';
import { FilesService } from '../files/files.service';
import { details, fileInfo, loadItems } from '../contracts/contract-view';
import { AuditService } from '../audit/audit.service';
import { EventsService } from '../events/events.service';
import type { AuditContext } from '../audit/audit-context';
import { contractLabel, fmtDate, itemLine } from '../audit/describe';
import { DeliveryDto, DeliverySearchDto } from './dto';
import { PAGE_SIZE } from '../contracts/dto';

const CONTRACT_LIKE = (column: 'number_search' | 'counterparty_search', param: string) =>
  `EXISTS (SELECT 1 FROM contracts c WHERE c.id = d.contract_id AND c.${column} LIKE :${param})`;
const ITEM_LIKE = (param: string) =>
  `EXISTS (SELECT 1 FROM delivery_lines l JOIN order_items i ON i.id = l.order_item_id
           WHERE l.delivery_id = d.id AND i.name_search LIKE :${param})`;

@Injectable()
export class DeliveriesService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly files: FilesService,
    private readonly audit: AuditService,
    private readonly live: EventsService,
  ) {}

  /** Усі поставки, новіші — першими. */
  async search(f: DeliverySearchDto): Promise<DeliveryList> {
    const qb = this.ds.manager.createQueryBuilder(Delivery, 'd');
    // Кожне слово запиту — у накладній, номері договору, контрагенті або найменуванні цієї поставки.
    searchWords(f.q).forEach((word, n) => {
      const p = `q${n}`;
      qb.andWhere(
        `(d.invoice_search LIKE :${p} OR ${CONTRACT_LIKE('number_search', p)} OR ` +
          `${CONTRACT_LIKE('counterparty_search', p)} OR ${ITEM_LIKE(p)})`,
        { [p]: like(word) },
      );
    });
    if (f.invoice?.trim()) qb.andWhere('d.invoice_search LIKE :invoice', { invoice: like(f.invoice) });
    if (f.number?.trim()) qb.andWhere(CONTRACT_LIKE('number_search', 'number'), { number: like(f.number) });
    if (f.counterparty?.trim()) qb.andWhere(CONTRACT_LIKE('counterparty_search', 'cp'), { cp: like(f.counterparty) });
    if (f.item?.trim()) qb.andWhere(ITEM_LIKE('item'), { item: like(f.item) });
    if (f.dateFrom) qb.andWhere('d.date >= :from', { from: f.dateFrom });
    if (f.dateTo) qb.andWhere('d.date <= :to', { to: f.dateTo });

    const page = f.page ?? 1;
    const pageSize = f.pageSize ?? PAGE_SIZE;
    const [found, total] = await qb
      .orderBy('d.date', 'DESC')
      .addOrderBy('d.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    const em = this.ds.manager;
    const ids = found.map((d) => d.id);
    const full = new Map(
      (ids.length
        ? await em.find(Delivery, { where: { id: In(ids) }, relations: { file: true, lines: true }, order: { lines: { id: 'ASC' } } })
        : []
      ).map((d) => [d.id, d]),
    );
    const contractIds = [...new Set(found.map((d) => d.contractId))];
    const contracts = new Map(
      (contractIds.length ? await em.findBy(Contract, { id: In(contractIds) }) : []).map((c) => [c.id, c]),
    );
    const itemIds = [...full.values()].flatMap((d) => d.lines.map((l) => l.orderItemId));
    const items = new Map((itemIds.length ? await em.findBy(OrderItem, { id: In(itemIds) }) : []).map((i) => [i.id, i]));

    return {
      // Поставку могли видалити між двома запитами — тоді її просто немає на сторінці.
      deliveries: found.flatMap((row) => {
        const d = full.get(row.id);
        const c = contracts.get(row.contractId);
        if (!d || !c) return [];
        return {
          id: d.id,
          date: d.date,
          invoiceNumber: d.invoiceNumber,
          notes: d.notes,
          file: fileInfo(d.file),
          contract: { id: c.id, number: c.number, counterparty: c.counterparty },
          lines: d.lines.map((l) => {
            const i = items.get(l.orderItemId)!;
            return { orderItemId: l.orderItemId, name: i.name, unit: i.unit, quantity: l.quantity };
          }),
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  /** Додає поставку. Скан накладної (необов'язковий) приходить разом із даними. */
  async create(contractId: number, dto: DeliveryDto, ctx: AuditContext, upload?: Express.Multer.File): Promise<ContractDetails> {
    return this.ds.transaction(async (em) => {
      // Блокуємо договір, щоб дві одночасні поставки не перевищили "очікуємо".
      const c = await em.findOne(Contract, { where: { id: contractId }, lock: { mode: 'pessimistic_write' } });
      if (!c) throw new NotFoundException('Договір не знайдено');
      const items = new Map((await loadItems(em, [contractId])).get(contractId)!.map((i) => [i.id, i]));

      const errors: Record<string, string> = {};
      const lines: { orderItemId: number; quantity: number }[] = [];
      const seen = new Set<number>();
      dto.lines.forEach((line, i) => {
        const item = items.get(line.orderItemId);
        if (!item || seen.has(line.orderItemId)) {
          errors._ = 'Некоректний перелік найменувань.';
          return;
        }
        seen.add(line.orderItemId);
        const q = round3(line.quantity);
        if (q === 0) return;
        if (q > item.pending) errors[`lines.${i}.quantity`] = `Очікується лише ${qty(item.pending)}`;
        else lines.push({ orderItemId: item.id, quantity: q });
      });
      if (!lines.length && !Object.keys(errors).length) errors._ = 'Вкажіть кількість хоча б по одному найменуванню.';
      if (Object.keys(errors).length) fail(errors);

      const file = upload ? await this.files.save(em, upload) : null;
      const delivery = await em.save(Delivery, em.create(Delivery, {
        contractId,
        date: dto.date,
        invoiceNumber: dto.invoiceNumber.trim(),
        invoiceSearch: searchText(dto.invoiceNumber),
        notes: orNull(dto.notes),
        fileId: file?.id ?? null,
        lines: lines.map((l) => em.create(DeliveryLine, l)),
      }));
      const described = lines.map((l) => ({ ...l, ...describeItem(items.get(l.orderItemId)!) }));
      await this.live.publish(em, { type: 'contract', action: 'updated', contractId });
      await this.audit.record(em, ctx, {
        action: 'delivery.create',
        entityType: 'delivery',
        entityId: delivery.id,
        contractId,
        summary:
          `Додано поставку за накладною № ${delivery.invoiceNumber} від ${fmtDate(delivery.date)}, ` +
          `договір ${contractLabel(c)}: ${described.map((l) => itemLine(l, l.quantity)).join('; ')}` +
          (file ? `; скан «${file.originalName}»` : ''),
        details: {
          delivery: { id: delivery.id, date: delivery.date, invoiceNumber: delivery.invoiceNumber, notes: delivery.notes, file: fileInfo(file), lines: described },
        },
      });
      return details(em, c, today());
    });
  }

  async remove(id: number, ctx: AuditContext): Promise<{ contractId: number }> {
    const { contractId, file } = await this.ds.transaction(async (em) => {
      const d = await em.findOne(Delivery, { where: { id }, relations: { file: true, lines: true } });
      if (!d) throw new NotFoundException('Поставку не знайдено');
      const c = await em.findOneByOrFail(Contract, { id: d.contractId });
      const items = new Map((await loadItems(em, [d.contractId])).get(d.contractId)!.map((i) => [i.id, i]));
      await em.delete(Delivery, { id });
      if (d.fileId) await em.delete(StoredFile, { id: d.fileId });
      // Знімок видаленої поставки — з назвами найменувань, щоб журнал читався й без договору.
      const lines = d.lines.map((l) => ({ orderItemId: l.orderItemId, quantity: l.quantity, ...describeItem(items.get(l.orderItemId)) }));
      await this.live.publish(em, { type: 'contract', action: 'updated', contractId: d.contractId });
      await this.audit.record(em, ctx, {
        action: 'delivery.delete',
        entityType: 'delivery',
        entityId: id,
        contractId: d.contractId,
        summary:
          `Видалено поставку за накладною № ${d.invoiceNumber} від ${fmtDate(d.date)}, ` +
          `договір ${contractLabel(c)}: ${lines.map((l) => itemLine(l, l.quantity)).join('; ')}` +
          (d.file ? `; скан «${d.file.originalName}»` : ''),
        details: {
          before: { id: d.id, date: d.date, invoiceNumber: d.invoiceNumber, notes: d.notes, createdAt: d.createdAt, file: fileInfo(d.file), lines },
        },
      });
      return { contractId: d.contractId, file: d.file };
    });
    this.files.removeFromDisk([file]);
    return { contractId };
  }
}

const describeItem = (i?: { name: string; unit: string }) => ({ name: i?.name ?? '?', unit: i?.unit ?? '' });
