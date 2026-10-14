export const searchText = (s?: string | null) => (s ?? '').trim().toUpperCase();

/** Шаблон LIKE «містить» для *_search-колонок (з екрануванням %, _ і \\). */
export const likePattern = (s: string) => `%${searchText(s).replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;

/** Слова загального пошуку (не більше 10). */
export const searchWords = (q?: string) => (q?.trim() ? q.trim().split(/\s+/).slice(0, 10) : []);

export const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const qty = (n: number) => n.toLocaleString('uk-UA', { maximumFractionDigits: 3 });

/** Порожній рядок -> null */
export const orNull = (s?: string | null) => (s && s.trim() ? s.trim() : null);
