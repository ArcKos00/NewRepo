import { useRef, useState, type DragEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ContractStage, PoolContractInput, PoolItem } from '@order-tracking/shared';
import { api } from '../api';
import { contractNo, fdate, fq, parseQty, stageText, today } from '../format';
import { FieldError, StageSelect, FormError, LoadError, Loading, Modal, useFieldErrors } from '../components/ui';

/** Що тягнемо: запис зліва (у замовлення) чи рядок справа (назад, тобто прибрати). */
const DND_POOL = 'application/x-pool-item';
const DND_LINE = 'application/x-pool-line';

interface Line {
  key: number;
  poolItemId: number;
  /** Знімок запису: якщо його тим часом розподілять чи видалять, рядок усе одно видно. */
  item: Pick<PoolItem, 'name' | 'unit' | 'enteredOn'>;
  quantity: string;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const qtyOf = (s: string) => {
  const v = parseQty(s);
  return v && Number.isFinite(v) ? v : 0;
};

/**
 * Договір з нерозподіленого: зліва — усе доступне (пошук, перетягування), посередині — що
 * йде в замовлення, справа — поля договору. Після перетягування — вікно з кількістю (Enter — усе).
 */
export function PoolContractPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: available, error, isPending } = useQuery({ queryKey: ['pool', 'available'], queryFn: api.poolAvailable });
  const { data: counterparties = [] } = useQuery({ queryKey: ['counterparties'], queryFn: api.counterparties });

  const nextKey = useRef(1);
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState('');
  const [asking, setAsking] = useState<PoolItem | null>(null);
  const [over, setOver] = useState<'left' | 'right' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [local, setLocal] = useState<Record<string, string>>({});

  const [number, setNumber] = useState('');
  const [counterparty, setCounterparty] = useState('');
  const [contractDate, setContractDate] = useState(today());
  const [expected, setExpected] = useState('');
  const [notes, setNotes] = useState('');
  const [stage, setStage] = useState<ContractStage | null>(null);
  const dateTouched = useRef(false);
  const unsigned = stage !== null;

  const save = useMutation({
    mutationFn: (input: PoolContractInput) => api.createFromPool(input),
    onSuccess: (c) => {
      qc.setQueryData(['contract', c.id], c);
      qc.invalidateQueries({ queryKey: ['pool'] });
      qc.invalidateQueries({ queryKey: ['contracts'] });
      qc.invalidateQueries({ queryKey: ['counterparties'] });
      navigate(`/contracts/${c.id}`, { state: { flash: `Договір ${contractNo(c.number)} створено з нерозподіленого.` } });
    },
    onError: () => setConfirming(false),
  });
  const { err: serverErr, touch } = useFieldErrors(save.error);
  const err = (key: string) => local[key] ?? serverErr(key);
  const edit = (key: string) => {
    touch(key);
    if (local[key]) setLocal(({ [key]: _, ...rest }) => rest);
  };

  if (isPending) return <Loading />;
  if (error) return <LoadError error={error} />;

  const pool = new Map(available.map((p) => [p.id, p]));
  const picked = (id: number) => round3(lines.filter((l) => l.poolItemId === id).reduce((s, l) => s + qtyOf(l.quantity), 0));
  /** Скільки запису ще лишилось зліва з урахуванням уже перетягнутого. */
  const left = (p: PoolItem) => Math.max(0, round3(p.remaining - picked(p.id)));
  const words = search.trim().toUpperCase().split(/\s+/).filter(Boolean);
  const shown = available.filter((p) => left(p) > 0 && words.every((w) => p.name.toUpperCase().includes(w)));

  const take = (p: PoolItem, q: number) => {
    const existing = lines.find((l) => l.poolItemId === p.id);
    if (existing) {
      setLines(lines.map((l) => (l === existing ? { ...l, quantity: String(round3(qtyOf(l.quantity) + q)) } : l)));
    } else {
      setLines([...lines, { key: nextKey.current++, poolItemId: p.id, item: p, quantity: String(q) }]);
    }
    setLocal(({ _, ...rest }) => rest);
  };
  const drop = (key: number) => setLines(lines.filter((l) => l.key !== key));

  const onDropRight = (e: DragEvent) => {
    e.preventDefault();
    setOver(null);
    const p = pool.get(Number(e.dataTransfer.getData(DND_POOL)));
    if (p && left(p) > 0) setAsking(p);
  };
  const onDropLeft = (e: DragEvent) => {
    e.preventDefault();
    setOver(null);
    const key = Number(e.dataTransfer.getData(DND_LINE));
    if (key) drop(key);
  };
  const allow = (type: string, side: 'left' | 'right') => (e: DragEvent) => {
    if (!e.dataTransfer.types.includes(type)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (over !== side) setOver(side);
  };

  /** Перевірки до вікна підтвердження: щоб не підтверджувати те, що сервер однаково відхилить. */
  const check = () => {
    const errors: Record<string, string> = {};
    if (!lines.length) errors._ = 'Перетягніть у замовлення хоча б одне найменування.';
    if (!unsigned) {
      if (!number.trim()) errors.number = 'Вкажіть номер договору (без номера — лише непідписаний)';
      if (!counterparty.trim()) errors.counterparty = 'Вкажіть контрагента (без нього — лише непідписаний)';
      if (!contractDate) errors.contractDate = 'Вкажіть дату договору (без неї — лише непідписаний)';
    }
    if (expected && contractDate && expected < contractDate) errors.expectedDeliveryDate = 'Не може бути раніше дати договору';
    lines.forEach((l, i) => {
      const q = parseQty(l.quantity);
      const p = pool.get(l.poolItemId);
      const max = p ? round3(p.remaining - picked(l.poolItemId) + qtyOf(l.quantity)) : 0;
      if (!q || !Number.isFinite(q)) errors[`lines.${i}.quantity`] = 'Вкажіть кількість';
      else if (!p) errors[`lines.${i}.quantity`] = 'Уже недоступно — приберіть рядок';
      else if (q > max) errors[`lines.${i}.quantity`] = `Залишилось лише ${fq(max)} ${p.unit}`;
    });
    setLocal(errors);
    return Object.keys(errors).length === 0;
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (check()) setConfirming(true);
  };
  const create = () =>
    save.mutate({
      number,
      counterparty,
      contractDate: contractDate || null,
      expectedDeliveryDate: expected || null,
      notes: notes || null,
      stage,
      lines: lines.map((l) => ({ poolItemId: l.poolItemId, quantity: parseQty(l.quantity) as number })),
    });

  return (
    <>
      <div><Link to="/pool" className="small">← до нерозподілених</Link></div>
      <div className="head"><h1>Замовлення з нерозподіленого</h1></div>
      <FormError error={save.error} />
      {local._ && <div className="alert bad">{local._}</div>}

      <div className="alloc">
        <section className={`panel alloc-col${over === 'left' ? ' over' : ''}`} aria-label="Доступні найменування"
          onDragOver={allow(DND_LINE, 'left')} onDragLeave={() => setOver(null)} onDrop={onDropLeft}>
          <div className="panel-h">Нерозподілені <span className="muted small">{shown.length}</span></div>
          <div className="alloc-search">
            <input type="search" placeholder="Пошук найменування" aria-label="Пошук найменування" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <ul className="alloc-list">
            {shown.length === 0 && (
              <li className="empty small">{available.length ? 'Нічого не знайдено.' : 'Усе вже розподілено.'}</li>
            )}
            {shown.map((p) => (
              <li key={p.id} className="alloc-item" draggable
                onDragStart={(e) => { e.dataTransfer.setData(DND_POOL, String(p.id)); e.dataTransfer.effectAllowed = 'move'; }}
                onDragEnd={() => setOver(null)}
                onDoubleClick={() => setAsking(p)}>
                <div className="alloc-name">
                  {p.name}
                  <div className="small muted">внесено {fdate(p.enteredOn)}{p.notes && ` · ${p.notes}`}</div>
                </div>
                <span className="num tight">{fq(left(p))} <span className="muted">{p.unit}</span></span>
                <button type="button" className="btn sm" aria-label={`Додати «${p.name}» у замовлення`} title="У замовлення" onClick={() => setAsking(p)}>→</button>
              </li>
            ))}
          </ul>
        </section>

        <section className={`panel alloc-col dropzone${over === 'right' ? ' over' : ''}`} aria-label="Найменування замовлення"
          onDragOver={allow(DND_POOL, 'right')} onDragLeave={() => setOver(null)} onDrop={onDropRight}>
          <div className="panel-h">У замовлення <span className="muted small">{lines.length}</span></div>
          <ul className="alloc-list">
            {lines.length === 0 && <li className="empty small">Перетягніть сюди найменування зліва<br />(або кнопка «→»).</li>}
            {lines.map((l, i) => {
              const p = pool.get(l.poolItemId);
              return (
                <li key={l.key} className="alloc-item picked" draggable
                  onDragStart={(e) => { e.dataTransfer.setData(DND_LINE, String(l.key)); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragEnd={() => setOver(null)}>
                  <div className="alloc-name">
                    {l.item.name}
                    <div className="small muted">
                      внесено {fdate(l.item.enteredOn)}{p ? ` · доступно ${fq(p.remaining)}` : ' · уже недоступно'}
                    </div>
                    <FieldError message={err(`lines.${i}.quantity`)} />
                  </div>
                  <span className="input-group alloc-qty">
                    <input type="number" step="any" min="0" aria-label={`Кількість «${l.item.name}»`} value={l.quantity}
                      className={err(`lines.${i}.quantity`) ? 'invalid' : ''}
                      onChange={(e) => { setLines(lines.map((x) => (x.key === l.key ? { ...x, quantity: e.target.value } : x))); edit(`lines.${i}.quantity`); }} />
                    <span>{l.item.unit}</span>
                  </span>
                  <button type="button" className="btn sm danger" aria-label={`Прибрати «${l.item.name}»`} title="Прибрати" onClick={() => drop(l.key)}>×</button>
                </li>
              );
            })}
          </ul>
        </section>

        <form className="panel alloc-form" onSubmit={submit} noValidate>
          <div className="panel-h">Договір</div>
          <div className="panel-b stack-sm">
            <StageSelect value={stage} onChange={(s) => {
              setStage(s);
              if (!dateTouched.current) setContractDate(s ? '' : today());
              ['number', 'counterparty', 'contractDate'].forEach(edit);
            }} />
            <label className="f">Номер договору{unsigned && <span className="muted small"> (можна пізніше)</span>}
              <input className={err('number') ? 'invalid' : ''} value={number} maxLength={100} autoComplete="off"
                onChange={(e) => { setNumber(e.target.value); edit('number'); }} />
              <FieldError message={err('number')} />
            </label>
            <label className="f">Контрагент (постачальник){unsigned && <span className="muted small"> (можна пізніше)</span>}
              <input className={err('counterparty') ? 'invalid' : ''} value={counterparty} maxLength={300} list="alloc-counterparties"
                onChange={(e) => { setCounterparty(e.target.value); edit('counterparty'); edit('number'); }} />
              <datalist id="alloc-counterparties">{counterparties.map((cp) => <option key={cp} value={cp} />)}</datalist>
              <FieldError message={err('counterparty')} />
            </label>
            <label className="f">Дата договору{unsigned && <span className="muted small"> (можна пізніше)</span>}
              <input type="date" className={err('contractDate') ? 'invalid' : ''} value={contractDate}
                onChange={(e) => { setContractDate(e.target.value); dateTouched.current = true; edit('contractDate'); edit('expectedDeliveryDate'); }} />
              <FieldError message={err('contractDate')} />
            </label>
            <label className="f">Орієнтовна дата поставки
              <input type="date" className={err('expectedDeliveryDate') ? 'invalid' : ''} value={expected}
                onChange={(e) => { setExpected(e.target.value); edit('expectedDeliveryDate'); }} />
              <FieldError message={err('expectedDeliveryDate')} />
            </label>
            <label className="f">Примітки
              <textarea value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <button className="btn primary" type="submit" disabled={save.isPending}>Створити договір</button>
            <span className="small muted">Файл договору можна додати потім у редагуванні.</span>
          </div>
        </form>
      </div>

      {asking && (
        <QuantityModal item={asking} max={left(asking)} onClose={() => setAsking(null)}
          onTake={(q) => { take(asking, q); setAsking(null); }} />
      )}

      {confirming && (
        <Modal title="Створити договір?" onClose={() => !save.isPending && setConfirming(false)}>
          <dl className="meta small">
            <dt>Етап</dt><dd>{stageText(stage)}</dd>
            <dt>Номер договору</dt><dd>{number.trim() || <span className="muted">без номера</span>}</dd>
            <dt>Контрагент</dt><dd>{counterparty.trim() || <span className="muted">—</span>}</dd>
            <dt>Дата договору</dt><dd className="num">{fdate(contractDate)}</dd>
            <dt>Орієнтовна дата поставки</dt><dd className="num">{fdate(expected || null)}</dd>
          </dl>
          <div className="small">
            <b>Найменування ({lines.length}):</b>
            <ul className="confirm-list">
              {lines.map((l) => <li key={l.key}>{l.item.name} — <span className="num">{fq(qtyOf(l.quantity))}</span> {l.item.unit}</li>)}
            </ul>
            <span className="muted">Однакові найменування (назва й од. виміру) стануть одним рядком договору.</span>
          </div>
          <div className="actions">
            <button type="button" className="btn primary" autoFocus onClick={create} disabled={save.isPending}>
              {save.isPending ? 'Створення…' : 'Так, створити'}
            </button>
            <button type="button" className="btn" onClick={() => setConfirming(false)} disabled={save.isPending}>Скасувати</button>
          </div>
        </Modal>
      )}
    </>
  );
}

/** Скільки перенести: одразу стоїть уся доступна кількість — Enter переносить усе. */
function QuantityModal({ item, max, onClose, onTake }: {
  item: PoolItem;
  max: number;
  onClose: () => void;
  onTake: (q: number) => void;
}) {
  const [value, setValue] = useState(String(max));
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = parseQty(value);
    if (!q || !Number.isFinite(q)) setError('Вкажіть кількість більшу за 0');
    else if (q > max) setError(`Доступно лише ${fq(max)} ${item.unit}`);
    else onTake(q);
  };
  return (
    <Modal title={item.name} onClose={onClose}>
      <form onSubmit={submit} noValidate className="stack-sm">
        <div className="small muted">Внесено {fdate(item.enteredOn)} · доступно <b className="num">{fq(max)}</b> {item.unit}</div>
        <label className="f">Кількість у замовлення
          <span className="input-group">
            <input type="number" step="any" min="0" max={max} value={value} autoFocus onFocus={(e) => e.target.select()}
              className={error ? 'invalid' : ''} onChange={(e) => { setValue(e.target.value); setError(null); }} />
            <span>{item.unit}</span>
          </span>
          <FieldError message={error ?? undefined} />
        </label>
        <div className="actions">
          <button type="submit" className="btn primary">Перенести</button>
          <button type="button" className="btn" onClick={() => setValue(String(max))}>Усе</button>
          <button type="button" className="btn" onClick={onClose}>Скасувати</button>
        </div>
      </form>
    </Modal>
  );
}
