import type { ContractDetails, OrderItem } from '@order-tracking/shared';
import { qty } from '../common/text';

/** Описи змін людською мовою для журналу. */

const d = (s: string | null | undefined) => (s ? s.split('-').reverse().join('.') : '—');
const t = (s: string | null | undefined) => (s ? `«${s}»` : '—');

export const contractLabel = (c: { number: string; counterparty: string }) => `№ ${c.number} (${c.counterparty})`;

export const itemLine = (i: { name: string; unit: string }, quantity: number) => `${i.name} — ${qty(quantity)} ${i.unit}`;

/** Що змінилось у шапці й найменуваннях договору. */
export function contractChanges(before: ContractDetails, after: ContractDetails): string[] {
  const out: string[] = [];
  const field = (label: string, a: string, b: string) => {
    if (a !== b) out.push(`${label}: ${a} → ${b}`);
  };
  field('номер', t(before.number), t(after.number));
  field('контрагент', t(before.counterparty), t(after.counterparty));
  field('дата договору', d(before.contractDate), d(after.contractDate));
  field('орієнтовна дата поставки', d(before.expectedDeliveryDate), d(after.expectedDeliveryDate));
  field('примітки', t(before.notes), t(after.notes));
  const signed = (draft: boolean) => (draft ? 'сформовано, не підписано' : 'підписано');
  field('стан', signed(before.draft), signed(after.draft));

  const was = new Map(before.items.map((i) => [i.id, i]));
  const now = new Set(after.items.map((i) => i.id));
  for (const i of before.items) if (!now.has(i.id)) out.push(`видалено найменування ${itemLine(i, i.quantity)}`);
  for (const i of after.items) {
    const old = was.get(i.id);
    if (!old) {
      out.push(`додано найменування ${itemLine(i, i.quantity)}`);
      continue;
    }
    const diff: string[] = [];
    if (old.name !== i.name) diff.push(`назва ${t(old.name)} → ${t(i.name)}`);
    if (old.quantity !== i.quantity || old.unit !== i.unit)
      diff.push(`кількість ${qty(old.quantity)} ${old.unit} → ${qty(i.quantity)} ${i.unit}`);
    if (diff.length) out.push(`«${old.name}»: ${diff.join(', ')}`);
  }
  return out;
}

/** Що змінилось у недопоставці («не зможуть») і орієнтовній даті. */
export function shortfallChanges(before: ContractDetails, after: ContractDetails): string[] {
  const out: string[] = [];
  if (before.expectedDeliveryDate !== after.expectedDeliveryDate)
    out.push(`орієнтовна дата поставки: ${d(before.expectedDeliveryDate)} → ${d(after.expectedDeliveryDate)}`);
  const was = new Map(before.items.map((i) => [i.id, i]));
  for (const i of after.items) {
    const old = was.get(i.id) as OrderItem | undefined;
    if (!old) continue;
    if (old.cancelled !== i.cancelled)
      out.push(`«${i.name}»: не зможуть ${qty(old.cancelled)} → ${qty(i.cancelled)} ${i.unit}`);
    if ((old.cancelReason ?? '') !== (i.cancelReason ?? ''))
      out.push(`«${i.name}»: причина ${t(old.cancelReason)} → ${t(i.cancelReason)}`);
  }
  return out;
}

export const joinChanges = (head: string, changes: string[]) =>
  changes.length ? `${head}: ${changes.join('; ')}` : `${head} (без змін)`;

export const fmtDate = d;
