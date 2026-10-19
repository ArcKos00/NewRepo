import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { fdate, fq, fsize } from '../format';
import { ConfirmButton, FormError, LoadError, Loading, ProgressBar, StatusPill } from '../components/ui';
import { useMe } from '../user';

export function ContractPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useMe();
  const { data: c, error, isPending } = useQuery({ queryKey: ['contract', id], queryFn: () => api.get(id) });

  const removeContract = useMutation({
    mutationFn: () => api.remove(id),
    onSuccess: () => {
      qc.removeQueries({ queryKey: ['contract', id] });
      qc.invalidateQueries({ queryKey: ['contracts'] });
      navigate('/contracts', { state: { flash: `Договір № ${c?.number} видалено.` } });
    },
  });
  const setDraft = useMutation({
    mutationFn: (draft: boolean) => api.setDraft(id, draft),
    onSuccess: (saved) => {
      qc.setQueryData(['contract', id], saved);
      qc.invalidateQueries({ queryKey: ['contracts'] });
    },
  });
  const removeDelivery = useMutation({
    mutationFn: (deliveryId: number) => api.removeDelivery(deliveryId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contract', id] });
      qc.invalidateQueries({ queryKey: ['contracts'] });
    },
  });

  if (isPending) return <Loading />;
  if (error) return <LoadError error={error} />;

  const items = new Map(c.items.map((i) => [i.id, i]));

  return (
    <>
      <div><Link to="/contracts" className="small">← до списку</Link></div>
      <div className="head">
        <div>
          <h1>Договір № {c.number} <StatusPill status={c.status} /></h1>
          <div className="muted">{c.counterparty}</div>
        </div>
        <div className="actions">
          {me && (
            <>
              {c.draft && (
                <button type="button" className="btn primary" onClick={() => setDraft.mutate(false)} disabled={setDraft.isPending}>
                  Підписано
                </button>
              )}
              <Link className={c.draft ? 'btn' : 'btn primary'} to={`/contracts/${id}/deliveries/new`}>+ Додати поставку</Link>
              <Link className="btn" to={`/contracts/${id}/shortfall`}>Недопоставка / дата</Link>
              <Link className="btn" to={`/contracts/${id}/edit`}>Редагувати</Link>
            </>
          )}
          {me?.admin && <Link className="btn" to={`/audit?contractId=${id}`}>Історія</Link>}
          {me && (
            <ConfirmButton confirmText="Точно видалити договір?" onConfirm={() => removeContract.mutate()} disabled={removeContract.isPending}>
              Видалити
            </ConfirmButton>
          )}
        </div>
      </div>
      <FormError error={removeContract.error ?? setDraft.error ?? removeDelivery.error} />

      <div className="qty4">
        <div><span className="k">Замовлено</span><span className="v">{fq(c.totals.quantity)}</span></div>
        <div><span className="k">Отримано</span><span className="v c-ok">{fq(c.totals.received)}</span></div>
        <div><span className="k">Очікуємо</span><span className="v c-info">{fq(c.totals.pending)}</span></div>
        <div><span className="k">Не зможуть</span><span className="v c-danger">{fq(c.totals.cancelled)}</span></div>
      </div>

      <div className="panel panel-b">
        <dl className="meta">
          <dt>Номер договору</dt><dd>{c.number}</dd>
          <dt>Дата договору</dt><dd className="num">{fdate(c.contractDate)}</dd>
          <dt>Контрагент</dt><dd>{c.counterparty}</dd>
          {c.draft && <><dt>Стан</dt><dd><span className="c-warn">Сформовано, не підписано</span> <span className="muted small">— очікує на подальші дії</span></dd></>}
          <dt>Орієнтовна дата поставки</dt>
          <dd>
            <span className="num">{fdate(c.expectedDeliveryDate)}</span>
            {c.status === 'overdue' && <span className="c-danger small"> (прострочено)</span>}
          </dd>
          <dt>Файл договору</dt>
          <dd>
            {c.file
              ? <><a href={api.fileUrl(c.file.id)}>{c.file.name}</a> <span className="muted small">({fsize(c.file.size)})</span></>
              : <span className="muted">не завантажено</span>}
          </dd>
          {c.notes && <><dt>Примітки</dt><dd className="pre">{c.notes}</dd></>}
        </dl>
      </div>

      <h2>Найменування</h2>
      <div className="panel tbl-box">
        <table>
          <thead>
            <tr><th>Найменування</th><th className="r">Замовлено</th><th className="r">Отримано</th><th className="r">Очікуємо</th><th className="r">Не зможуть</th><th /></tr>
          </thead>
          <tbody>
            {c.items.map((i) => (
              <tr key={i.id}>
                <td>{i.name}{i.cancelReason && <div className="small c-danger">{i.cancelReason}</div>}</td>
                <td className="r tight num">{fq(i.quantity)} {i.unit}</td>
                <td className="r num c-ok">{fq(i.received)}</td>
                <td className="r num c-info"><b>{fq(i.pending)}</b></td>
                <td className="r num c-danger">{fq(i.cancelled)}</td>
                <td style={{ width: 140 }}><ProgressBar total={i.quantity} received={i.received} cancelled={i.cancelled} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Поставки</h2>
      {c.deliveries.length === 0 ? <div className="panel empty">Поставок ще не було.</div> : (
        <div className="panel tbl-box">
          <table>
            <thead><tr><th>Дата</th><th>Накладна</th><th>Що приїхало</th><th>Файл</th><th /></tr></thead>
            <tbody>
              {c.deliveries.map((d) => (
                <tr key={d.id}>
                  <td className="tight num">{fdate(d.date)}</td>
                  <td>№ {d.invoiceNumber}{d.notes && <div className="small muted pre">{d.notes}</div>}</td>
                  <td className="small">
                    {d.lines.map((l) => {
                      const it = items.get(l.orderItemId);
                      return <div key={l.orderItemId}>{it?.name} — <span className="num">{fq(l.quantity)}</span> {it?.unit}</div>;
                    })}
                  </td>
                  <td className="small">{d.file && <a href={api.fileUrl(d.file.id)}>{d.file.name}</a>}</td>
                  <td className="r">
                    {me && (
                      <ConfirmButton className="btn sm danger" confirmText="Точно?" onConfirm={() => removeDelivery.mutate(d.id)} disabled={removeDelivery.isPending}>
                        Видалити
                      </ConfirmButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
