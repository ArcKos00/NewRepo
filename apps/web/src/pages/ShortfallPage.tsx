import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ContractDetails } from '@order-tracking/shared';
import { api } from '../api';
import { fq, parseQty } from '../format';
import { FieldError, FormError, LoadError, Loading, useFieldErrors } from '../components/ui';

/** Недопоставка ("не зможуть") і орієнтовна дата поставки. */
export function ShortfallPage() {
  const id = Number(useParams().id);
  const { data, error, isPending } = useQuery({ queryKey: ['contract', id], queryFn: () => api.get(id) });
  if (isPending) return <Loading />;
  if (error) return <LoadError error={error} />;
  return <ShortfallForm contract={data} />;
}

function ShortfallForm({ contract: c }: { contract: ContractDetails }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [expected, setExpected] = useState(c.expectedDeliveryDate ?? '');
  const [rows, setRows] = useState(() =>
    Object.fromEntries(c.items.map((i) => [i.id, { cancelled: String(i.cancelled), reason: i.cancelReason ?? '' }])),
  );

  const save = useMutation({
    mutationFn: () =>
      api.updateShortfall(c.id, {
        expectedDeliveryDate: expected || null,
        items: c.items.map((i) => ({
          orderItemId: i.id,
          cancelled: parseQty(rows[i.id].cancelled) ?? 0,
          cancelReason: rows[i.id].reason || null,
        })),
      }),
    onSuccess: (saved) => {
      qc.setQueryData(['contract', c.id], saved);
      qc.invalidateQueries({ queryKey: ['contracts'] });
      navigate(`/contracts/${c.id}`, { state: { flash: 'Стан договору оновлено.' } });
    },
  });
  const { err, touch } = useFieldErrors(save.error);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  const set = (itemId: number, patch: Partial<{ cancelled: string; reason: string }>) =>
    setRows({ ...rows, [itemId]: { ...rows[itemId], ...patch } });

  return (
    <>
      <div><Link to={`/contracts/${c.id}`} className="small">← до договору</Link></div>
      <div className="head">
        <div>
          <h1>Недопоставка та дата поставки</h1>
          <div className="muted">Договір № {c.number} · {c.counterparty}</div>
        </div>
      </div>

      <form onSubmit={submit} noValidate className="stack">
        <FormError error={save.error} />
        <div className="panel panel-b narrow">
          <label className="f">Орієнтовна дата поставки
            <input id="u-expected" type="date" className={err('expectedDeliveryDate') ? 'invalid' : ''} value={expected} onChange={(e) => { setExpected(e.target.value); touch('expectedDeliveryDate'); }} />
            <FieldError message={err('expectedDeliveryDate')} />
          </label>
        </div>

        <div className="panel">
          <div className="panel-h">Кількість, яку постачальник не зможе поставити</div>
          <div className="tbl-box">
            <table className="form-tbl">
              <thead><tr><th>Найменування</th><th className="r">Замовлено</th><th className="r">Отримано</th><th>Не зможуть</th><th>Причина</th></tr></thead>
              <tbody>
                {c.items.map((i, idx) => {
                  const lineErr = err(`items.${idx}.cancelled`);
                  return (
                    <tr key={i.id}>
                      <td>{i.name}</td>
                      <td className="r tight num">{fq(i.quantity)} {i.unit}</td>
                      <td className="r num">{fq(i.received)}</td>
                      <td style={{ width: 160 }}>
                        <input aria-label={`Не зможуть: ${i.name}`} name={`items.${idx}.cancelled`} type="number" step="any" min="0" max={Math.max(0, i.quantity - i.received)}
                          className={lineErr ? 'invalid' : ''} value={rows[i.id].cancelled} onChange={(e) => { set(i.id, { cancelled: e.target.value }); touch(`items.${idx}.cancelled`); }} />
                        <FieldError message={lineErr} />
                      </td>
                      <td>
                        <input aria-label={`Причина: ${i.name}`} name={`items.${idx}.reason`} value={rows[i.id].reason} maxLength={1000}
                          onChange={(e) => { set(i.id, { reason: e.target.value }); touch(`items.${idx}.cancelReason`); }} />
                        <FieldError message={err(`items.${idx}.cancelReason`)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="actions">
          <button className="btn primary" type="submit" disabled={save.isPending}>{save.isPending ? 'Збереження…' : 'Зберегти'}</button>
          <Link to={`/contracts/${c.id}`} className="btn">Скасувати</Link>
        </div>
      </form>
    </>
  );
}
