import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Not } from 'typeorm';
import type { ContractDetails, ContractSummary } from '@order-tracking/shared';
import { Contract, Delivery, OrderItem, StoredFile } from '../database/entities';
import { orNull, qty, round3, searchText, today } from '../common/text';
import { fail } from '../common/validation';
import { FilesService } from '../files/files.service';
import { details, loadItems, summary } from './contract-view';
import { ContractDto, SearchDto, ShortfallDto } from './dto';

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (ch) => `\\${ch}`);

@Injectable()
export class ContractsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly files: FilesService,
  ) {}

  /** Договір з блокуванням рядка (FOR UPDATE) — щоб паралельні зміни не порушили залишки. */
  private async lock(em: EntityManager, id: number) {
    const c = await em.findOne(Contract, { where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!c) throw new NotFoundException('Договір не знайдено');
    return c;
  }

  // ---------- Перегляд і пошук ----------

  async search(f: SearchDto): Promise<ContractSummary[]> {
    const qb = this.ds.manager.createQueryBuilder(Contract, 'c');
    const like = (s: string) => `%${escapeLike(searchText(s))}%`;
    if (f.number?.trim()) qb.andWhere('c.number_search LIKE :number', { number: like(f.number) });
    if (f.counterparty?.trim()) qb.andWhere('c.counterparty_search LIKE :cp', { cp: like(f.counterparty) });
    if (f.item?.trim()) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM order_items i WHERE i.contract_id = c.id AND i.name_search LIKE :item)',
        { item: like(f.item) },
      );
    }
    if (f.dateFrom) qb.andWhere('c.contract_date >= :from', { from: f.dateFrom });
    if (f.dateTo) qb.andWhere('c.contract_date <= :to', { to: f.dateTo });
    const contracts = await qb.orderBy('c.contract_date', 'DESC').addOrderBy('c.id', 'DESC').getMany();

    const items = await loadItems(this.ds.manager, contracts.map((c) => c.id));
    const now = today();
    const list = contracts.map((c) => summary(c, items.get(c.id)!, now));
    return f.status ? list.filter((c) => c.status === f.status) : list;
  }

  async get(id: number): Promise<ContractDetails> {
    const c = await this.ds.manager.findOneBy(Contract, { id });
    if (!c) throw new NotFoundException('Договір не знайдено');
    return details(this.ds.manager, c, today());
  }

  async counterparties(): Promise<string[]> {
    const rows: { counterparty: string }[] = await this.ds.manager
      .createQueryBuilder(Contract, 'c')
      .select('DISTINCT c.counterparty', 'counterparty')
      .orderBy('counterparty')
      .getRawMany();
    return rows.map((r) => r.counterparty);
  }

  // ---------- Створення / редагування ----------

  private async checkCommon(em: EntityManager, dto: ContractDto, id?: number) {
    const errors: Record<string, string> = {};
    if (dto.expectedDeliveryDate && dto.expectedDeliveryDate < dto.contractDate)
      errors.expectedDeliveryDate = 'Не може бути раніше дати договору';
    const duplicate = await em.existsBy(Contract, {
      numberSearch: searchText(dto.number),
      counterpartySearch: searchText(dto.counterparty),
      ...(id ? { id: Not(id) } : {}),
    });
    if (duplicate) errors.number = 'Договір з таким номером у цього контрагента вже існує';
    return errors;
  }

  private applyHeader(c: Contract, dto: ContractDto) {
    c.number = dto.number.trim();
    c.counterparty = dto.counterparty.trim();
    c.numberSearch = searchText(dto.number);
    c.counterpartySearch = searchText(dto.counterparty);
    c.contractDate = dto.contractDate;
    c.expectedDeliveryDate = orNull(dto.expectedDeliveryDate);
    c.notes = orNull(dto.notes);
  }

  private itemFields(i: { name: string; unit: string; quantity: number }) {
    return { name: i.name.trim(), nameSearch: searchText(i.name), unit: i.unit.trim(), quantity: round3(i.quantity) };
  }

  async create(dto: ContractDto): Promise<ContractDetails> {
    return this.ds.transaction(async (em) => {
      const errors = await this.checkCommon(em, dto);
      dto.items.forEach((row, i) => {
        if (row.id) errors[`items.${i}.name`] = 'Нове замовлення не може містити наявні найменування';
      });
      if (Object.keys(errors).length) fail(errors);

      const c = em.create(Contract);
      this.applyHeader(c, dto);
      await em.save(c);
      await em.save(OrderItem, dto.items.map((i) => em.create(OrderItem, { contractId: c.id, ...this.itemFields(i) })));
      return details(em, c, today());
    });
  }

  async update(id: number, dto: ContractDto): Promise<ContractDetails> {
    return this.ds.transaction(async (em) => {
      const c = await this.lock(em, id);
      const existing = new Map((await loadItems(em, [id])).get(id)!.map((i) => [i.id, i]));
      const errors = await this.checkCommon(em, dto, id);

      dto.items.forEach((row, i) => {
        if (!row.id) return;
        const item = existing.get(row.id);
        if (!item) {
          errors._ = 'Найменування не належить цьому договору.';
          return;
        }
        const min = round3(item.received + item.cancelled);
        if (row.quantity < min)
          errors[`items.${i}.quantity`] =
            `Не менше ${qty(min)} (отримано ${qty(item.received)}, не зможуть ${qty(item.cancelled)})`;
      });
      const kept = new Set(dto.items.map((r) => r.id).filter(Boolean));
      for (const item of existing.values()) {
        if (!kept.has(item.id) && item.received > 0)
          errors._ = `Не можна видалити «${item.name}»: по ньому вже є поставки.`;
      }
      if (Object.keys(errors).length) fail(errors);

      this.applyHeader(c, dto);
      await em.save(c);
      const removed = [...existing.keys()].filter((itemId) => !kept.has(itemId));
      if (removed.length) await em.delete(OrderItem, { id: In(removed) });
      for (const row of dto.items) {
        if (row.id) await em.update(OrderItem, { id: row.id }, this.itemFields(row));
        else await em.save(OrderItem, em.create(OrderItem, { contractId: id, ...this.itemFields(row) }));
      }
      return details(em, c, today());
    });
  }

  async remove(id: number): Promise<void> {
    const files = await this.ds.transaction(async (em) => {
      const c = await this.lock(em, id);
      const deliveries = await em.find(Delivery, { where: { contractId: id } });
      const fileIds = [c.fileId, ...deliveries.map((d) => d.fileId)].filter((x): x is number => !!x);
      const files = fileIds.length ? await em.findBy(StoredFile, { id: In(fileIds) }) : [];
      // Спершу поставки (їх рядки посилаються на найменування), потім договір — найменування каскадом.
      await em.delete(Delivery, { contractId: id });
      await em.delete(Contract, { id });
      if (files.length) await em.delete(StoredFile, { id: In(fileIds) });
      return files;
    });
    this.files.removeFromDisk(files);
  }

  // ---------- Файл договору ----------

  async setFile(id: number, upload: Express.Multer.File | undefined): Promise<ContractDetails> {
    if (!upload) fail({ file: 'Оберіть файл' });
    let old: StoredFile | null = null;
    const result = await this.ds.transaction(async (em) => {
      const c = await this.lock(em, id);
      old = c.fileId ? await em.findOneBy(StoredFile, { id: c.fileId }) : null;
      const file = await this.files.save(em, upload);
      c.fileId = file.id;
      await em.save(c);
      if (old) await em.delete(StoredFile, { id: old.id });
      return details(em, c, today());
    });
    this.files.removeFromDisk([old]);
    return result;
  }

  async removeFile(id: number): Promise<ContractDetails> {
    let old: StoredFile | null = null;
    const result = await this.ds.transaction(async (em) => {
      const c = await this.lock(em, id);
      old = c.fileId ? await em.findOneBy(StoredFile, { id: c.fileId }) : null;
      c.fileId = null;
      await em.save(c);
      if (old) await em.delete(StoredFile, { id: old.id });
      return details(em, c, today());
    });
    this.files.removeFromDisk([old]);
    return result;
  }

  // ---------- Недопоставка / орієнтовна дата ----------

  async updateShortfall(id: number, dto: ShortfallDto): Promise<ContractDetails> {
    return this.ds.transaction(async (em) => {
      const c = await this.lock(em, id);
      const items = new Map((await loadItems(em, [id])).get(id)!.map((i) => [i.id, i]));
      const errors: Record<string, string> = {};
      dto.items.forEach((row, i) => {
        const item = items.get(row.orderItemId);
        if (!item) {
          errors._ = 'Найменування не належить цьому договору.';
          return;
        }
        const max = Math.max(0, round3(item.quantity - item.received));
        if (row.cancelled > max) errors[`items.${i}.cancelled`] = `Не більше ${qty(max)}`;
      });
      if (Object.keys(errors).length) fail(errors);

      c.expectedDeliveryDate = orNull(dto.expectedDeliveryDate);
      await em.save(c);
      for (const row of dto.items) {
        const cancelled = round3(row.cancelled);
        await em.update(OrderItem, { id: row.orderItemId }, {
          cancelledQuantity: cancelled,
          cancelReason: cancelled > 0 ? orNull(row.cancelReason) : null,
        });
      }
      return details(em, c, today());
    });
  }
}
