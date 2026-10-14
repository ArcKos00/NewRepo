import { EntityManager, In } from 'typeorm';
import type {
  ContractDetails, ContractStatus, ContractSummary, FileInfo, OrderItem as OrderItemView,
} from '@order-tracking/shared';
import { Contract, Delivery, DeliveryLine, OrderItem, StoredFile } from '../database/entities';
import { round3 } from '../common/text';

export const fileInfo = (f: StoredFile | null | undefined): FileInfo | null =>
  f ? { id: f.id, name: f.originalName, size: f.size } : null;

/** Найменування договорів з порахованими "отримано" та "очікуємо". */
export async function loadItems(em: EntityManager, contractIds: number[]): Promise<Map<number, OrderItemView[]>> {
  const result = new Map<number, OrderItemView[]>(contractIds.map((id) => [id, []]));
  if (contractIds.length === 0) return result;

  const items = await em.find(OrderItem, { where: { contractId: In(contractIds) }, order: { id: 'ASC' } });
  const sums: { order_item_id: number; received: string }[] = items.length
    ? await em
        .createQueryBuilder(DeliveryLine, 'l')
        .select('l.order_item_id', 'order_item_id')
        .addSelect('SUM(l.quantity)', 'received')
        .where('l.order_item_id IN (:...ids)', { ids: items.map((i) => i.id) })
        .groupBy('l.order_item_id')
        .getRawMany()
    : [];
  const received = new Map(sums.map((s) => [Number(s.order_item_id), Number(s.received)]));

  for (const i of items) {
    const rec = received.get(i.id) ?? 0;
    result.get(i.contractId)!.push({
      id: i.id,
      name: i.name,
      unit: i.unit,
      quantity: i.quantity,
      received: rec,
      cancelled: i.cancelledQuantity,
      cancelReason: i.cancelReason,
      pending: Math.max(0, round3(i.quantity - rec - i.cancelledQuantity)),
    });
  }
  return result;
}

export function statusOf(items: OrderItemView[], expected: string | null, today: string): ContractStatus {
  const pending = items.reduce((s, i) => s + i.pending, 0);
  if (items.length === 0 || pending <= 0) return 'completed';
  if (expected && expected < today) return 'overdue';
  return items.some((i) => i.received > 0) ? 'partial' : 'waiting';
}

export function summary(c: Contract, items: OrderItemView[], today: string): ContractSummary {
  const sum = (k: 'quantity' | 'received' | 'cancelled' | 'pending') => round3(items.reduce((s, i) => s + i[k], 0));
  return {
    id: c.id,
    number: c.number,
    counterparty: c.counterparty,
    contractDate: c.contractDate,
    expectedDeliveryDate: c.expectedDeliveryDate,
    status: statusOf(items, c.expectedDeliveryDate, today),
    totals: { quantity: sum('quantity'), received: sum('received'), cancelled: sum('cancelled'), pending: sum('pending') },
    items,
  };
}

export async function details(em: EntityManager, c: Contract, today: string): Promise<ContractDetails> {
  const items = (await loadItems(em, [c.id])).get(c.id)!;
  const deliveries = await em.find(Delivery, {
    where: { contractId: c.id },
    relations: { file: true, lines: true },
    order: { date: 'DESC', id: 'DESC', lines: { id: 'ASC' } },
  });
  const file = c.fileId ? await em.findOneBy(StoredFile, { id: c.fileId }) : null;
  return {
    ...summary(c, items, today),
    notes: c.notes,
    file: fileInfo(file),
    deliveries: deliveries.map((d) => ({
      id: d.id,
      date: d.date,
      invoiceNumber: d.invoiceNumber,
      notes: d.notes,
      file: fileInfo(d.file),
      lines: d.lines.map((l) => ({ orderItemId: l.orderItemId, quantity: l.quantity })),
    })),
  };
}
