import { Link, useNavigate } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ContractStatus } from '@order-tracking/shared';
import { api } from '../api';
import { fdate, fq, STATUS_TEXT } from '../format';
import { LoadError, Loading, ProgressBar, StatusPill } from '../components/ui';
import { DebouncedInput, FilterBar, Pagination, RangeText, useListParams } from '../components/listing';

const FILTERS = ['counterparty', 'item', 'dateFrom', 'dateTo', 'status'] as const;
const KEYS = ['q', ...FILTERS] as const;

export function ContractsPage() {
  const navigate = useNavigate();
  const { values: f, page, update, setPage, reset } = useListParams(KEYS);
  const active = FILTERS.filter((k) => f[k]).length;
  const hasFilters = active > 0 || !!f.q.trim();

  const search = { ...f, status: (f.status || undefined) as ContractStatus | undefined, page };
  const { data, error, isPending, isPlaceholderData } = useQuery({
    queryKey: ['contracts', search],
    queryFn: () => api.search(search),
    // Під час набору/гортання лишаємо попередню сторінку, а не «Завантаження…».
    placeholderData: keepPreviousData,
  });
  const { data: counterparties = [] } = useQuery({ queryKey: ['counterparties'], queryFn: api.counterparties });

  // Найменування, що збіглися з пошуком, показуємо в рядку; інакше — перші три.
  const words = [...f.q.toUpperCase().split(/\s+/), f.item.trim().toUpperCase()].filter(Boolean);

  return (
    <>
      <div className="head">
        <h1>Замовлення (договори)</h1>
        <Link to="/contracts/new" className="btn primary">+ Нове замовлення</Link>
      </div>

      <FilterBar search={f.q} onSearch={(q) => update({ q })} placeholder="Пошук: № договору, контрагент, найменування"
        active={active} onReset={reset}>
        <label className="f">Контрагент
          <DebouncedInput value={f.counterparty} onChange={(counterparty) => update({ counterparty })} list="s-counterparties" />
          <datalist id="s-counterparties">{counterparties.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
        <label className="f">Найменування<DebouncedInput value={f.item} onChange={(item) => update({ item })} /></label>
        <label className="f">Дата договору з<input type="date" value={f.dateFrom} onChange={(e) => update({ dateFrom: e.target.value })} /></label>
        <label className="f">по<input type="date" value={f.dateTo} onChange={(e) => update({ dateTo: e.target.value })} /></label>
        <label className="f">Стан
          <select value={f.status} onChange={(e) => update({ status: e.target.value })}>
            <option value="">усі</option>
            {(Object.keys(STATUS_TEXT) as ContractStatus[]).map((s) => <option key={s} value={s}>{STATUS_TEXT[s]}</option>)}
          </select>
        </label>
      </FilterBar>

      {isPending ? <Loading /> : error ? <LoadError error={error} /> : data.total === 0 ? (
        <div className="panel empty">
          {hasFilters ? 'Нічого не знайдено. Спробуйте інший запит або скиньте фільтри.' : 'Ще немає жодного замовлення. Створіть перше кнопкою «+ Нове замовлення».'}
        </div>
      ) : (
        <>
          <div className="list-meta">
            <RangeText page={data.page} pageSize={data.pageSize} total={data.total} shown={data.contracts.length} />
          </div>
          <div className={`panel tbl-box${isPlaceholderData ? ' stale' : ''}`} aria-busy={isPlaceholderData}>
            <table>
              <thead>
                <tr><th>№ договору</th><th>Дата</th><th>Контрагент</th><th>Найменування</th><th>Орієнт. поставка</th><th>Виконання</th><th>Стан</th></tr>
              </thead>
              <tbody>
                {data.contracts.map((c) => {
                  const matched = words.length ? c.items.filter((i) => words.some((w) => i.name.toUpperCase().includes(w))) : [];
                  const shown = matched.length ? matched : c.items.slice(0, 3);
                  const rest = c.items.length - shown.length;
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
          <Pagination page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}
