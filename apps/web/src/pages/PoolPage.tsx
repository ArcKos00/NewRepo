import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PoolItemInput, PoolStatus } from '@order-tracking/shared';
import { api } from '../api';
import { fdate, fq, parseQty, POOL_STATUS_TEXT, today } from '../format';
import { useMe } from '../user';
import { ConfirmButton, FieldError, FormError, LoadError, Loading, PoolStatusPill, useFieldErrors } from '../components/ui';
import { FilterBar, Pagination, RangeText, useListParams } from '../components/listing';

const FILTERS = ['status', 'dateFrom', 'dateTo'] as const;
const KEYS = ['q', ...FILTERS] as const;

export const UNITS = ['шт', 'пач', 'уп', 'компл', 'кг', 'л', 'м', 'м²', 'рул'];

/** Нерозподілені найменування: внесення («свалка») і перелік з пошуком і фільтрами. */
export function PoolPage() {
  const me = useMe();
  const qc = useQueryClient();
  const { values: f, page, update, setPage, reset } = useListParams(KEYS);
  const active = FILTERS.filter((k) => f[k]).length;
  const hasFilters = active > 0 || !!f.q.trim();

  const search = { ...f, status: (f.status || undefined) as PoolStatus | undefined, page };
  const { data, error, isPending, isPlaceholderData } = useQuery({
    queryKey: ['pool', 'list', search],
    queryFn: () => api.pool(search),
    placeholderData: keepPreviousData,
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.removePool(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pool'] }),
  });

  return (
    <>
      <div className="head">
        <h1>Нерозподілені найменування</h1>
        {me && <Link to="/pool/new-contract" className="btn primary">Створити замовлення з нерозподіленого</Link>}
      </div>

      {me && <PoolEntry />}

      <FilterBar search={f.q} onSearch={(q) => update({ q })} placeholder="Пошук за найменуванням" active={active} onReset={reset}>
        <label className="f">Стан
          <select value={f.status} onChange={(e) => update({ status: e.target.value })}>
            <option value="">усі</option>
            {(Object.keys(POOL_STATUS_TEXT) as PoolStatus[]).map((s) => <option key={s} value={s}>{POOL_STATUS_TEXT[s]}</option>)}
          </select>
        </label>
        <label className="f">Дата внесення з<input type="date" value={f.dateFrom} onChange={(e) => update({ dateFrom: e.target.value })} /></label>
        <label className="f">по<input type="date" value={f.dateTo} onChange={(e) => update({ dateTo: e.target.value })} /></label>
      </FilterBar>

      <FormError error={remove.error} />

      {isPending ? <Loading /> : error ? <LoadError error={error} /> : data.total === 0 ? (
        <div className="panel empty">
          {hasFilters ? 'Нічого не знайдено. Спробуйте інший запит або скиньте фільтри.' : 'Ще нічого не внесено.'}
        </div>
      ) : (
        <>
          <div className="list-meta">
            <RangeText page={data.page} pageSize={data.pageSize} total={data.total} shown={data.items.length} />
          </div>
          <div className={`panel tbl-box${isPlaceholderData ? ' stale' : ''}`} aria-busy={isPlaceholderData}>
            <table>
              <thead>
                <tr>
                  <th>Внесено</th><th>Найменування</th><th className="r">Кількість</th><th className="r">Розподілено</th>
                  <th className="r">Залишок</th><th>Стан</th><th>Договори</th>{me && <th />}
                </tr>
              </thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id}>
                    <td className="tight num">{fdate(p.enteredOn)}</td>
                    <td>{p.name}{p.notes && <div className="small muted pre">{p.notes}</div>}</td>
                    <td className="r tight num">{fq(p.quantity)} {p.unit}</td>
                    <td className="r tight num c-ok">{fq(p.allocated)}</td>
                    <td className="r tight num c-info"><b>{fq(p.remaining)}</b></td>
                    <td className="tight"><PoolStatusPill status={p.status} /></td>
                    <td className="small">
                      {p.allocations.length === 0 ? <span className="muted">—</span> : p.allocations.map((a) => (
                        <div key={a.contractId}>
                          <Link to={`/contracts/${a.contractId}`}>№ {a.number}</Link>{' '}
                          <span className="muted">— <span className="num">{fq(a.quantity)}</span></span>
                        </div>
                      ))}
                    </td>
                    {me && (
                      <td className="r">
                        {p.allocated === 0 && (
                          <ConfirmButton className="btn sm danger" confirmText="Точно?" onConfirm={() => remove.mutate(p.id)} disabled={remove.isPending}>
                            Видалити
                          </ConfirmButton>
                        )}
                      </td>
                    )}
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

/** Рядок вводу: Enter — додати і знову до назви; од. виміру і дата лишаються для наступного. */
function PoolEntry() {
  const qc = useQueryClient();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('шт');
  const [enteredOn, setEnteredOn] = useState(today());
  const [notes, setNotes] = useState('');
  const [added, setAdded] = useState<string | null>(null);

  const { data: available = [] } = useQuery({ queryKey: ['pool', 'available'], queryFn: api.poolAvailable });
  const names = [...new Set(available.map((p) => p.name))];

  const add = useMutation({
    mutationFn: (input: PoolItemInput) => api.addPool(input),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['pool'] });
      setAdded(`Додано: ${p.name} — ${fq(p.quantity)} ${p.unit}`);
      setName('');
      setQuantity('');
      setNotes('');
      nameRef.current?.focus();
    },
  });
  const { err, touch } = useFieldErrors(add.error);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setAdded(null);
    add.mutate({ name, unit, quantity: parseQty(quantity) as number, enteredOn, notes: notes || null });
  };

  return (
    <form className="panel" onSubmit={submit} noValidate>
      <div className="panel-h">Внести найменування</div>
      <div className="panel-b stack-sm">
        <FormError error={add.error} />
        <div className="pool-entry">
          <label className="f grow">Найменування
            <input ref={nameRef} className={err('name') ? 'invalid' : ''} value={name} maxLength={500} list="pool-names" autoComplete="off"
              onChange={(e) => { setName(e.target.value); touch('name'); }} />
            <datalist id="pool-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
            <FieldError message={err('name')} />
          </label>
          <label className="f">Кількість
            <input type="number" step="any" min="0" className={err('quantity') ? 'invalid' : ''} value={quantity}
              onChange={(e) => { setQuantity(e.target.value); touch('quantity'); }} />
            <FieldError message={err('quantity')} />
          </label>
          <label className="f">Од. виміру
            <input value={unit} maxLength={20} list="pool-units" className={err('unit') ? 'invalid' : ''}
              onChange={(e) => { setUnit(e.target.value); touch('unit'); }} />
            <datalist id="pool-units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
            <FieldError message={err('unit')} />
          </label>
          <label className="f">Дата внесення
            <input type="date" value={enteredOn} className={err('enteredOn') ? 'invalid' : ''}
              onChange={(e) => { setEnteredOn(e.target.value); touch('enteredOn'); }} />
            <FieldError message={err('enteredOn')} />
          </label>
          <label className="f grow">Примітка
            <input value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <button className="btn primary" type="submit" disabled={add.isPending}>{add.isPending ? 'Додаємо…' : 'Додати'}</button>
        </div>
        {added && <div className="small c-ok" role="status">{added}</div>}
      </div>
    </form>
  );
}
