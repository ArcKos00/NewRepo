import { Link, useNavigate } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { fdate, fq } from '../format';
import { LoadError, Loading } from '../components/ui';
import { DebouncedInput, FilterBar, Pagination, RangeText, useListParams } from '../components/listing';

const FILTERS = ['invoice', 'number', 'counterparty', 'item', 'dateFrom', 'dateTo'] as const;
const KEYS = ['q', ...FILTERS] as const;

/** Усі поставки (за накладними) по всіх договорах — лише перегляд. */
export function DeliveriesPage() {
  const navigate = useNavigate();
  const { values: f, page, update, setPage, reset } = useListParams(KEYS);
  const active = FILTERS.filter((k) => f[k]).length;
  const hasFilters = active > 0 || !!f.q.trim();

  const search = { ...f, page };
  const { data, error, isPending, isPlaceholderData } = useQuery({
    queryKey: ['deliveries', search],
    queryFn: () => api.deliveries(search),
    placeholderData: keepPreviousData,
  });
  const { data: counterparties = [] } = useQuery({ queryKey: ['counterparties'], queryFn: api.counterparties });

  return (
    <>
      <div className="head">
        <h1>Поставки</h1>
      </div>

      <FilterBar search={f.q} onSearch={(q) => update({ q })}
        placeholder="Пошук: накладна, № договору, контрагент, найменування" active={active} onReset={reset}>
        <label className="f">№ накладної<DebouncedInput value={f.invoice} onChange={(invoice) => update({ invoice })} /></label>
        <label className="f">№ договору<DebouncedInput value={f.number} onChange={(number) => update({ number })} /></label>
        <label className="f">Контрагент
          <DebouncedInput value={f.counterparty} onChange={(counterparty) => update({ counterparty })} list="d-counterparties" />
          <datalist id="d-counterparties">{counterparties.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
        <label className="f">Найменування<DebouncedInput value={f.item} onChange={(item) => update({ item })} /></label>
        <label className="f">Дата поставки з<input type="date" value={f.dateFrom} onChange={(e) => update({ dateFrom: e.target.value })} /></label>
        <label className="f">по<input type="date" value={f.dateTo} onChange={(e) => update({ dateTo: e.target.value })} /></label>
      </FilterBar>

      {isPending ? <Loading /> : error ? <LoadError error={error} /> : data.total === 0 ? (
        <div className="panel empty">
          {hasFilters ? 'Нічого не знайдено. Спробуйте інший запит або скиньте фільтри.' : 'Ще немає жодної поставки.'}
        </div>
      ) : (
        <>
          <div className="list-meta">
            <RangeText page={data.page} pageSize={data.pageSize} total={data.total} shown={data.deliveries.length} />
          </div>
          <div className={`panel tbl-box${isPlaceholderData ? ' stale' : ''}`} aria-busy={isPlaceholderData}>
            <table>
              <thead>
                <tr><th>Дата</th><th>Накладна</th><th>Договір</th><th>Найменування</th><th>Скан</th><th>Примітка</th></tr>
              </thead>
              <tbody>
                {data.deliveries.map((d) => (
                  <tr key={d.id} className="clickable" onClick={(e) => { if (!(e.target as HTMLElement).closest('a')) navigate(`/contracts/${d.contract.id}`); }}>
                    <td className="tight num">{fdate(d.date)}</td>
                    <td className="tight"><b>{d.invoiceNumber}</b></td>
                    <td>
                      <Link to={`/contracts/${d.contract.id}`}>{d.contract.number ?? <i className="muted">без номера</i>}</Link>
                      <div className="small muted">{d.contract.counterparty}</div>
                    </td>
                    <td className="small">
                      {d.lines.map((l) => (
                        <div key={l.orderItemId}>{l.name} <span className="muted">— <span className="num">{fq(l.quantity)}</span> {l.unit}</span></div>
                      ))}
                    </td>
                    <td className="tight small">{d.file ? <a href={api.fileUrl(d.file.id)} title={d.file.name}>файл</a> : <span className="muted">—</span>}</td>
                    <td className="small pre">{d.notes ?? <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}
