import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';

/**
 * Пошук, фільтри і сторінка списку живуть в адресі сторінки — ними можна поділитися посиланням,
 * а «Назад» у браузері повертає попередній пошук.
 */
export function useListParams<K extends string>(keys: readonly K[]) {
  const [params, setParams] = useSearchParams();
  const values = Object.fromEntries(keys.map((k) => [k, params.get(k) ?? ''])) as Record<K, string>;
  const page = Math.max(1, Math.floor(Number(params.get('page'))) || 1);

  /** Зміна пошуку чи фільтра — знову з першої сторінки. */
  const update = (patch: Partial<Record<K, string>>) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch) as [K, string | undefined][]) {
        if (v?.trim()) next.set(k, v);
        else next.delete(k);
      }
      next.delete('page');
      return next;
    }, { replace: true });

  const setPage = (p: number) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (p > 1) next.set('page', String(p));
      else next.delete('page');
      return next;
    });
    window.scrollTo({ top: 0 });
  };

  const reset = () => setParams({}, { replace: true });
  return { values, page, update, setPage, reset };
}

/** Поле, що віддає значення через паузу в наборі (або одразу по Enter) — без запиту на кожну літеру. */
export function DebouncedInput({ value, onChange, delay = 300, ...rest }: {
  value: string;
  onChange: (value: string) => void;
  delay?: number;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [local, setLocal] = useState(value);
  // Останнє відправлене значення: щоб «повернення» його ж через адресу не перебивало набір.
  const sent = useRef(value);
  const timer = useRef<number>(undefined);
  const latest = useRef(onChange);
  latest.current = onChange;

  // Значення змінили ззовні («Скинути», «Назад» у браузері).
  useEffect(() => {
    if (value !== sent.current) {
      sent.current = value;
      setLocal(value);
    }
  }, [value]);

  const send = (v: string) => {
    window.clearTimeout(timer.current);
    if (v === sent.current) return;
    sent.current = v;
    latest.current(v);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <input
      {...rest}
      value={local}
      onChange={(e) => {
        const v = e.target.value;
        setLocal(v);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => send(v), delay);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') send(local);
        rest.onKeyDown?.(e);
      }}
    />
  );
}

/** Плашка над списком: одне поле пошуку + кнопка «Фільтри», що розгортає решту полів. */
export function FilterBar({ search, onSearch, placeholder, active, onReset, children }: {
  search: string;
  onSearch: (value: string) => void;
  placeholder: string;
  /** Скільки фільтрів (крім пошуку) задано — число на кнопці */
  active: number;
  onReset: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(active > 0);
  return (
    <section className="panel filters">
      <div className="filters-bar">
        <label className="search">
          <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4.5 4.5" /></svg>
          <DebouncedInput type="search" value={search} onChange={onSearch} placeholder={placeholder} aria-label="Пошук" />
        </label>
        <button type="button" className={`btn${open ? ' on' : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}>
          Фільтри{active > 0 && <span className="badge">{active}</span>}
        </button>
        {(active > 0 || search) && <button type="button" className="btn" onClick={onReset}>Скинути</button>}
      </div>
      {open && <div className="filters-panel grid">{children}</div>}
    </section>
  );
}

/** 1 … 4 5 6 … 20 */
function pageNumbers(page: number, pages: number): (number | '…')[] {
  const set = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const sorted = [...set].sort((a, b) => a - b);
  return sorted.flatMap((n, i) => (i > 0 && n - sorted[i - 1] > 1 ? ['…' as const, n] : [n]));
}

export function Pagination({ page, pageSize, total, onPage }: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const go = useRef(onPage);
  go.current = onPage;
  // Поки дивились, записи могли видалити — з «зайвої» сторінки переходимо на останню.
  useEffect(() => {
    if (total > 0 && page > pages) go.current(pages);
  }, [total, page, pages]);

  if (pages <= 1) return null;
  return (
    <nav className="pager" aria-label="Сторінки">
      <button type="button" className="btn sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ Назад</button>
      {pageNumbers(page, pages).map((n, i) =>
        n === '…' ? <span key={`gap${i}`} className="muted">…</span> : (
          <button key={n} type="button" className={`btn sm num${n === page ? ' current' : ''}`}
            aria-current={n === page ? 'page' : undefined} onClick={() => onPage(n)}>{n}</button>
        ),
      )}
      <button type="button" className="btn sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Далі ›</button>
    </nav>
  );
}

/** «Показано 26–50 з 134» */
export function RangeText({ page, pageSize, total, shown }: { page: number; pageSize: number; total: number; shown: number }) {
  const from = (page - 1) * pageSize + 1;
  return (
    <div className="small muted">
      {total <= pageSize ? `Знайдено: ${total}` : `Показано ${from}–${from + shown - 1} з ${total}`}
    </div>
  );
}
