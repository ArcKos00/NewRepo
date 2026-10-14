import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { ContractDetails } from '@order-tracking/shared';
import { Contract, Delivery, DeliveryLine, StoredFile } from '../database/entities';
import { orNull, qty, round3, today } from '../common/text';
import { fail } from '../common/validation';
import { FilesService } from '../files/files.service';
import { details, loadItems } from '../contracts/contract-view';
import { DeliveryDto } from './dto';

@Injectable()
export class DeliveriesService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly files: FilesService,
  ) {}

  /** Додає поставку. Скан накладної (необов'язковий) приходить разом із даними. */
  async create(contractId: number, dto: DeliveryDto, upload?: Express.Multer.File): Promise<ContractDetails> {
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
      await em.save(Delivery, em.create(Delivery, {
        contractId,
        date: dto.date,
        invoiceNumber: dto.invoiceNumber.trim(),
        notes: orNull(dto.notes),
        fileId: file?.id ?? null,
        lines: lines.map((l) => em.create(DeliveryLine, l)),
      }));
      return details(em, c, today());
    });
  }

  async remove(id: number): Promise<{ contractId: number }> {
    const { contractId, file } = await this.ds.transaction(async (em) => {
      const d = await em.findOne(Delivery, { where: { id }, relations: { file: true } });
      if (!d) throw new NotFoundException('Поставку не знайдено');
      await em.delete(Delivery, { id });
      if (d.fileId) await em.delete(StoredFile, { id: d.fileId });
      return { contractId: d.contractId, file: d.file };
    });
    this.files.removeFromDisk([file]);
    return { contractId };
  }
}
