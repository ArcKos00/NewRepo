import type { ContractStage, ContractStatus, PoolStatus } from '@order-tracking/shared';

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

/** Етап для людини; null — підписано. */
export const stageText = (s: ContractStage | null) => (s ? STATUS_TEXT[s] : 'Підписано');

/** «№ 123» або «без номера» (непідписаний договір може ще не мати номера). */
export const contractNo = (number: string | null) => (number ? `№ ${number}` : 'без номера');

/** Етапи до підписання — по порядку. */
export const STAGES: ContractStage[] = ['planned', 'tender_announced', 'tender_held', 'draft'];

export const STATUS_TEXT: Record<ContractStatus, string> = {
  planned: 'Заплановано',
  tender_announced: 'Тендер оголошено',
  tender_held: 'Тендер відбувся',
  draft: 'Сформовано, не підписано',
  waiting: 'Очікується',
  partial: 'Частково поставлено',
  overdue: 'Прострочено',
  completed: 'Виконано',
};

export const POOL_STATUS_TEXT: Record<PoolStatus, string> = {
  unallocated: 'Нерозподілено',
  partial: 'Частково розподілено',
  allocated: 'Розподілено',
};
