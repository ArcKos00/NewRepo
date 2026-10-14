import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { ContractDetails } from '@order-tracking/shared';
import { Contract, Delivery, DeliveryLine, StoredFile } from '../database/entities';
import { orNull, qty, round3, today } from '../common/text';
import { fail } from '../common/validation';
import { FilesService } from '../files/files.service';
import { details, fileInfo, loadItems } from '../contracts/contract-view';
import { AuditService } from '../audit/audit.service';
import type { AuditContext } from '../audit/audit-context';
import { contractLabel, fmtDate, itemLine } from '../audit/describe';
import { DeliveryDto } from './dto';

@Injectable()
export class DeliveriesService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly files: FilesService,
    private readonly audit: AuditService,
  ) {}

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
        notes: orNull(dto.notes),
        fileId: file?.id ?? null,
        lines: lines.map((l) => em.create(DeliveryLine, l)),
      }));
      const described = lines.map((l) => ({ ...l, ...describeItem(items.get(l.orderItemId)!) }));
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
