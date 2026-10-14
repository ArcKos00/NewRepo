export const searchText = (s?: string | null) => (s ?? '').trim().toUpperCase();

export const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const qty = (n: number) => n.toLocaleString('uk-UA', { maximumFractionDigits: 3 });

/** Порожній рядок -> null */
export const orNull = (s?: string | null) => (s && s.trim() ? s.trim() : null);
