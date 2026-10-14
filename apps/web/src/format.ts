import type { ContractStatus } from '@order-tracking/shared';

export const fdate = (d: string | null) => (d ? d.split('-').reverse().join('.') : '—');

export const fq = (n: number) => n.toLocaleString('uk-UA', { maximumFractionDigits: 3 });

export function fsize(b: number) {
  if (b < 1024) return `${b} Б`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} КБ`;
  return `${(b / 1024 / 1024).toFixed(1)} МБ`;
}

export function today() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Рядок з поля вводу → число; '' → null; некоректне → NaN */
export function parseQty(s: string): number | null {
  const v = s.trim().replace(',', '.').replace(/\s/g, '');
  if (v === '') return null;
  return /^\d+(\.\d+)?$/.test(v) ? Math.round(Number(v) * 1000) / 1000 : NaN;
}

export const STATUS_TEXT: Record<ContractStatus, string> = {
  waiting: 'Очікується',
  partial: 'Частково поставлено',
  overdue: 'Прострочено',
  completed: 'Виконано',
};
