import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ContractDetails, ContractInput } from '@order-tracking/shared';
import { api } from '../api';
import { fq, parseQty, today } from '../format';
import { FieldError, FormError, LoadError, Loading, useFieldErrors } from '../components/ui';

interface Row {
  key: number;
  id?: number;
  name: string;
  unit: string;
  quantity: string;
  received: number;
}

/** Сторінка створення (/contracts/new) і редагування (/contracts/:id/edit) договору. */
export function ContractFormPage() {
  const { id } = useParams();
  const contractId = id ? Number(id) : null;
  const { data, error, isPending } = useQuery({
    queryKey: ['contract', contractId],
    queryFn: () => api.get(contractId!),
    enabled: contractId !== null,
  });

  if (contractId === null) return <ContractForm />;
  if (isPending) return <Loading />;
  if (error) return <LoadError error={error} />;
  return <ContractForm existing={data} />;
}

function ContractForm({ existing }: { existing?: ContractDetails }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const nextKey = useRef(1);
  const newRow = (): Row => ({ key: nextKey.current++, name: '', unit: 'шт', quantity: '', received: 0 });

  const [number, setNumber] = useState(existing?.number ?? '');
  const [counterparty, setCounterparty] = useState(existing?.counterparty ?? '');
  const [contractDate, setContractDate] = useState(existing?.contractDate ?? today());
  const [expected, setExpected] = useState(existing?.expectedDeliveryDate ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [removeFile, setRemoveFile] = useState(false);
  const [rows, setRows] = useState<Row[]>(() =>
    existing
      ? existing.items.map((i) => ({ key: nextKey.current++, id: i.id, name: i.name, unit: i.unit, quantity: String(i.quantity), received: i.received }))
      : [newRow()],
  );

  const { data: counterparties = [] } = useQuery({ queryKey: ['counterparties'], queryFn: api.counterparties });

  const save = useMutation({
    mutationFn: async () => {
      const input: ContractInput = {
        number,
        counterparty,
        contractDate,
        expectedDeliveryDate: expected || null,
        notes: notes || null,
        items: rows.map((r) => ({ id: r.id, name: r.name, unit: r.unit, quantity: parseQty(r.quantity) as number })),
      };
      let saved = existing ? await api.update(existing.id, input) : await api.create(input);
      let fileError = false;
      try {
        if (file) saved = await api.setFile(saved.id, file);
        else if (removeFile && saved.file) saved = await api.removeFile(saved.id);
      } catch {
        fileError = true;
      }
      return { saved, fileError };
    },
    onSuccess: ({ saved, fileError }) => {
      qc.setQueryData(['contract', saved.id], saved);
      qc.invalidateQueries({ queryKey: ['contracts'] });
      qc.invalidateQueries({ queryKey: ['counterparties'] });
      const msg = existing ? 'Зміни збережено.' : `Договір № ${saved.number} створено.`;
      navigate(`/contracts/${saved.id}`, {
        state: { flash: fileError ? `${msg} Але файл договору не вдалося зберегти — спробуйте ще раз у редагуванні.` : msg },
      });
    },
  });
  const { err, touch } = useFieldErrors(save.error);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  const updateRow = (key: number, patch: Partial<Row>) => setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const back = existing ? `/contracts/${existing.id}` : '/contracts';

  return (
    <>
      <div><Link to={back} className="small">← назад</Link></div>
      <div className="head"><h1>{existing ? `Редагування договору № ${existing.number}` : 'Нове замовлення'}</h1></div>

      <form onSubmit={submit} noValidate className="stack">
        <FormError error={save.error} />

        <div className="panel">
          <div className="panel-h">Договір</div>
          <div className="panel-b grid">
            <label className="f">Номер договору
              <input id="f-number" className={err('number') ? 'invalid' : ''} value={number} onChange={(e) => { setNumber(e.target.value); touch('number'); }} maxLength={100} autoComplete="off" />
              <FieldError message={err('number')} />
            </label>
            <label className="f span2">Контрагент
              <input id="f-counterparty" className={err('counterparty') ? 'invalid' : ''} value={counterparty} onChange={(e) => { setCounterparty(e.target.value); touch('counterparty'); touch('number'); }} maxLength={300} list="counterparties" />
              <datalist id="counterparties">{counterparties.map((cp) => <option key={cp} value={cp} />)}</datalist>
              <FieldError message={err('counterparty')} />
            </label>
            <label className="f">Дата договору
              <input id="f-date" type="date" className={err('contractDate') ? 'invalid' : ''} value={contractDate} onChange={(e) => { setContractDate(e.target.value); touch('contractDate'); touch('expectedDeliveryDate'); }} />
              <FieldError message={err('contractDate')} />
            </label>
            <label className="f">Орієнтовна дата поставки
              <input id="f-expected" type="date" className={err('expectedDeliveryDate') ? 'invalid' : ''} value={expected} onChange={(e) => { setExpected(e.target.value); touch('expectedDeliveryDate'); }} />
              <FieldError message={err('expectedDeliveryDate')} />
            </label>
            <label className="f">Файл договору
              <input id="f-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              {existing?.file && (
                <span className="small">
                  Поточний: <a href={api.fileUrl(existing.file.id)}>{existing.file.name}</a>{' '}
                  <label className="inline"><input id="f-remove-file" type="checkbox" checked={removeFile} onChange={(e) => setRemoveFile(e.target.checked)} /> видалити</label>
                </span>
              )}
            </label>
            <label className="f wide">Примітки
              <textarea id="f-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
            </label>
          </div>
        </div>

        <div className="panel">
          <div className="panel-h">
            Найменування
            <button type="button" className="btn sm" id="add-item" onClick={() => setRows([...rows, newRow()])}>+ Додати рядок</button>
          </div>
          <div className="tbl-box">
            <table className="form-tbl">
              <thead>
                <tr><th>Найменування</th><th>Кількість</th><th>Од. виміру</th>{existing && <th className="r">Отримано</th>}<th /></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.key}>
                    <td>
                      <input aria-label="Найменування" name={`items.${i}.name`} className={err(`items.${i}.name`) ? 'invalid' : ''} value={r.name} maxLength={500}
                        onChange={(e) => { updateRow(r.key, { name: e.target.value }); touch(`items.${i}.name`); }} autoFocus={r.key > 1 && !r.id && i === rows.length - 1} />
                      <FieldError message={err(`items.${i}.name`)} />
                    </td>
                    <td style={{ width: 160 }}>
                      <input aria-label="Кількість" name={`items.${i}.quantity`} type="number" step="any" min="0" className={err(`items.${i}.quantity`) ? 'invalid' : ''}
                        value={r.quantity} onChange={(e) => { updateRow(r.key, { quantity: e.target.value }); touch(`items.${i}.quantity`); }} />
                      <FieldError message={err(`items.${i}.quantity`)} />
                    </td>
                    <td style={{ width: 110 }}>
                      <input aria-label="Од. виміру" name={`items.${i}.unit`} value={r.unit} maxLength={20} onChange={(e) => { updateRow(r.key, { unit: e.target.value }); touch(`items.${i}.unit`); }} />
                      <FieldError message={err(`items.${i}.unit`)} />
                    </td>
                    {existing && <td className="r num" style={{ width: 90 }}>{r.id ? fq(r.received) : ''}</td>}
                    <td className="r" style={{ width: 50 }}>
                      {r.received > 0
                        ? <span className="muted" title="Є поставки — видалити не можна">🔒</span>
                        : <button type="button" className="btn sm danger" aria-label="Видалити рядок" onClick={() => setRows(rows.filter((x) => x.key !== r.key))}>×</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="actions">
          <button className="btn primary" type="submit" disabled={save.isPending}>
            {save.isPending ? 'Збереження…' : existing ? 'Зберегти зміни' : 'Створити замовлення'}
          </button>
          <Link to={back} className="btn">Скасувати</Link>
        </div>
      </form>
    </>
  );
}
