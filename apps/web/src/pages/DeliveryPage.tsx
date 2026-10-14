import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ContractDetails } from '@order-tracking/shared';
import { api } from '../api';
import { fdate, fq, parseQty, today } from '../format';
import { FieldError, FormError, LoadError, Loading, useFieldErrors } from '../components/ui';

export function DeliveryPage() {
  const id = Number(useParams().id);
  const { data, error, isPending } = useQuery({ queryKey: ['contract', id], queryFn: () => api.get(id) });
  if (isPending) return <Loading />;
  if (error) return <LoadError error={error} />;
  return <DeliveryForm contract={data} />;
}

function DeliveryForm({ contract: c }: { contract: ContractDetails }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [date, setDate] = useState(today());
  const [invoice, setInvoice] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [qty, setQty] = useState<Record<number, string>>({});

  const save = useMutation({
    mutationFn: () =>
      api.addDelivery(c.id, {
        date,
        invoiceNumber: invoice,
        notes: notes || null,
        // Порядок рядків = порядок найменувань, тому помилки "lines.N" збігаються з рядками таблиці.
        lines: c.items.map((i) => ({ orderItemId: i.id, quantity: parseQty(qty[i.id] ?? '') ?? 0 })),
      }, file),
    onSuccess: (saved) => {
      qc.setQueryData(['contract', c.id], saved);
      qc.invalidateQueries({ queryKey: ['contracts'] });
      navigate(`/contracts/${c.id}`, { state: { flash: `Поставку за накладною № ${invoice.trim()} додано.` } });
    },
  });
  const { err, touch } = useFieldErrors(save.error);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  const fillAll = () => setQty(Object.fromEntries(c.items.filter((i) => i.pending > 0).map((i) => [i.id, String(i.pending)])));

  return (
    <>
      <div><Link to={`/contracts/${c.id}`} className="small">← до договору</Link></div>
      <div className="head">
        <div>
          <h1>Нова поставка</h1>
          <div className="muted">Договір № {c.number} від <span className="num">{fdate(c.contractDate)}</span> · {c.counterparty}</div>
        </div>
      </div>

      <form onSubmit={submit} noValidate className="stack">
        <FormError error={save.error} />
        <div className="panel panel-b grid">
          <label className="f">Дата поставки
            <input id="d-date" type="date" className={err('date') ? 'invalid' : ''} value={date} onChange={(e) => { setDate(e.target.value); touch('date'); }} />
            <FieldError message={err('date')} />
          </label>
          <label className="f">Номер накладної
            <input id="d-invoice" className={err('invoiceNumber') ? 'invalid' : ''} value={invoice} onChange={(e) => { setInvoice(e.target.value); touch('invoiceNumber'); }} maxLength={100} autoComplete="off" />
            <FieldError message={err('invoiceNumber')} />
          </label>
          <label className="f">Скан накладної
            <input id="d-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <label className="f wide">Примітки
            <textarea id="d-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
          </label>
        </div>

        <div className="panel">
          <div className="panel-h">
            Що приїхало
            <button type="button" className="btn sm" onClick={fillAll}>Заповнити все, що очікуємо</button>
          </div>
          <div className="tbl-box">
            <table className="form-tbl">
              <thead><tr><th>Найменування</th><th className="r">Замовлено</th><th className="r">Очікуємо</th><th>Приїхало</th></tr></thead>
              <tbody>
                {c.items.map((i, idx) => {
                  const lineErr = err(`lines.${idx}.quantity`);
                  return (
                    <tr key={i.id} className={i.pending <= 0 ? 'muted' : ''}>
                      <td>{i.name}</td>
                      <td className="r tight num">{fq(i.quantity)} {i.unit}</td>
                      <td className="r num"><b>{fq(i.pending)}</b></td>
                      <td style={{ width: 180 }}>
                        <div className="input-group">
                          <input aria-label={`Приїхало: ${i.name}`} name={`lines.${idx}.quantity`} type="number" step="any" min="0" max={i.pending}
                            className={lineErr ? 'invalid' : ''} disabled={i.pending <= 0}
                            value={qty[i.id] ?? ''} onChange={(e) => { setQty({ ...qty, [i.id]: e.target.value }); touch(`lines.${idx}.quantity`); }} />
                          <span>{i.unit}</span>
                        </div>
                        <FieldError message={lineErr} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="actions">
          <button className="btn primary" type="submit" disabled={save.isPending}>{save.isPending ? 'Збереження…' : 'Зберегти поставку'}</button>
          <Link to={`/contracts/${c.id}`} className="btn">Скасувати</Link>
        </div>
      </form>
    </>
  );
}
