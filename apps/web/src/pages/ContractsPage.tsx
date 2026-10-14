import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { ContractSearch, ContractStatus } from '@order-tracking/shared';
import { api } from '../api';
import { fdate, fq, STATUS_TEXT } from '../format';
import { LoadError, Loading, ProgressBar, StatusPill } from '../components/ui';

const KEYS = ['number', 'counterparty', 'item', 'dateFrom', 'dateTo', 'status'] as const;

export function ContractsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // Фільтри живуть в адресі сторінки — пошуком можна поділитися посиланням.
  const filters: ContractSearch = Object.fromEntries(KEYS.map((k) => [k, params.get(k) ?? ''])) as ContractSearch;
  const [draft, setDraft] = useState(filters);
  const hasFilters = KEYS.some((k) => filters[k]);

  const { data, error, isPending } = useQuery({
    queryKey: ['contracts', filters],
    queryFn: () => api.search(filters),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setParams(Object.fromEntries(Object.entries(draft).filter(([, v]) => v && String(v).trim())));
  };
  const reset = () => {
    setDraft({});
    setParams({});
  };
  const set = (k: keyof ContractSearch) => (e: { target: { value: string } }) => setDraft({ ...draft, [k]: e.target.value });
  const itemFilter = filters.item?.trim().toUpperCase() ?? '';

  return (
    <>
      <div className="head">
        <h1>Замовлення (договори)</h1>
        <Link to="/contracts/new" className="btn primary">+ Нове замовлення</Link>
      </div>

      <form className="panel panel-b" onSubmit={submit}>
        <div className="grid">
          <label className="f">№ договору<input id="s-number" value={draft.number ?? ''} onChange={set('number')} /></label>
          <label className="f">Контрагент<input id="s-counterparty" value={draft.counterparty ?? ''} onChange={set('counterparty')} /></label>
          <label className="f">Найменування<input id="s-item" value={draft.item ?? ''} onChange={set('item')} /></label>
          <label className="f">Дата договору з<input id="s-from" type="date" value={draft.dateFrom ?? ''} onChange={set('dateFrom')} /></label>
          <label className="f">по<input id="s-to" type="date" value={draft.dateTo ?? ''} onChange={set('dateTo')} /></label>
          <label className="f">Стан
            <select id="s-status" value={draft.status ?? ''} onChange={set('status')}>
              <option value="">усі</option>
              {(Object.keys(STATUS_TEXT) as ContractStatus[]).map((s) => <option key={s} value={s}>{STATUS_TEXT[s]}</option>)}
            </select>
          </label>
        </div>
        <div className="actions mt">
          <button className="btn primary" type="submit">Знайти</button>
          {hasFilters && <button className="btn" type="button" onClick={reset}>Скинути</button>}
        </div>
      </form>

      {isPending ? <Loading /> : error ? <LoadError error={error} /> : data.length === 0 ? (
        <div className="panel empty">
          {hasFilters ? 'Нічого не знайдено. Спробуйте інший запит або скиньте фільтри.' : 'Ще немає жодного замовлення. Створіть перше кнопкою «+ Нове замовлення».'}
        </div>
      ) : (
        <>
          <div className="small muted">Знайдено: {data.length}</div>
          <div className="panel tbl-box">
            <table>
              <thead>
                <tr><th>№ договору</th><th>Дата</th><th>Контрагент</th><th>Найменування</th><th>Орієнт. поставка</th><th>Виконання</th><th>Стан</th></tr>
              </thead>
              <tbody>
                {data.map((c) => {
                  const shown = itemFilter ? c.items.filter((i) => i.name.toUpperCase().includes(itemFilter)) : c.items.slice(0, 3);
                  const rest = itemFilter ? 0 : c.items.length - shown.length;
                  return (
                    <tr key={c.id} className="clickable" onClick={(e) => { if (!(e.target as HTMLElement).closest('a')) navigate(`/contracts/${c.id}`); }}>
                      <td className="tight"><Link to={`/contracts/${c.id}`}><b>{c.number}</b></Link></td>
                      <td className="tight num">{fdate(c.contractDate)}</td>
                      <td>{c.counterparty}</td>
                      <td className="small">
                        {shown.map((i) => (
                          <div key={i.id}>
                            {i.name}{' '}
                            <span className="muted">
                              — {fq(i.quantity)} {i.unit} (отр. {fq(i.received)}, очік. {fq(i.pending)}
                              {i.cancelled > 0 && `, не зможуть ${fq(i.cancelled)}`})
                            </span>
                          </div>
                        ))}
                        {rest > 0 && <div className="muted">і ще {rest}…</div>}
                      </td>
                      <td className="tight num">{fdate(c.expectedDeliveryDate)}</td>
                      <td><ProgressBar total={c.totals.quantity} received={c.totals.received} cancelled={c.totals.cancelled} /></td>
                      <td><StatusPill status={c.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
