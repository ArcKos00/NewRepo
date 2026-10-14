import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { AuditKind, AuditSearch } from '@order-tracking/shared';
import { api } from '../api';
import { LoadError, Loading } from '../components/ui';
import { Pagination, RangeText, useListParams } from '../components/listing';

const KEYS = ['kind', 'actor', 'contractId', 'dateFrom', 'dateTo'] as const;

const KIND_TEXT: Record<AuditKind, string> = {
  changes: 'Зміни даних',
  deletes: 'Видалення',
  failed: 'Невдалі спроби',
  files: 'Перегляд файлів',
  ui: 'Кліки й переходи',
};

const ftime = (iso: string) =>
  new Date(iso).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Журнал дій: хто, коли і що зробив (усі зміни даних, невдалі спроби, кліки). */
export function AuditPage() {
  const [params, setParams] = useSearchParams();
  const filters = Object.fromEntries(KEYS.map((k) => [k, params.get(k) ?? ''])) as AuditSearch;
  const [draft, setDraft] = useState(filters);
  const hasFilters = KEYS.some((k) => filters[k]);
  const { page, setPage } = useListParams(KEYS);

  const { data, error, isPending, isPlaceholderData } = useQuery({
    queryKey: ['audit', filters, page],
    queryFn: () => api.audit({ ...filters, page }),
    placeholderData: keepPreviousData,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setParams(Object.fromEntries(Object.entries(draft).filter(([, v]) => v && String(v).trim())));
  };
  const reset = () => {
    setDraft({});
    setParams({});
  };
  const set = (k: keyof AuditSearch) => (e: { target: { value: string } }) => setDraft({ ...draft, [k]: e.target.value });

  return (
    <>
      <div className="head">
        <h1>Журнал дій{filters.contractId && <span className="muted"> · договір #{filters.contractId}</span>}</h1>
        {filters.contractId && <Link to={`/contracts/${filters.contractId}`} className="btn">До договору</Link>}
      </div>

      <form className="panel panel-b" onSubmit={submit}>
        <div className="grid">
          <label className="f">Що
            <select value={draft.kind ?? ''} onChange={set('kind')}>
              <option value="">усе</option>
              {(Object.keys(KIND_TEXT) as AuditKind[]).map((k) => <option key={k} value={k}>{KIND_TEXT[k]}</option>)}
            </select>
          </label>
          <label className="f">Хто (ім’я, логін або IP)<input value={draft.actor ?? ''} onChange={set('actor')} /></label>
          <label className="f">Дата з<input type="date" value={draft.dateFrom ?? ''} onChange={set('dateFrom')} /></label>
          <label className="f">по<input type="date" value={draft.dateTo ?? ''} onChange={set('dateTo')} /></label>
        </div>
        <div className="actions mt">
          <button className="btn primary" type="submit">Показати</button>
          {hasFilters && <button className="btn" type="button" onClick={reset}>Скинути</button>}
        </div>
      </form>

      {isPending ? <Loading /> : error ? <LoadError error={error} /> : data.total === 0 ? (
        <div className="panel empty">Записів немає.</div>
      ) : (
        <>
          <div className="list-meta">
            <RangeText page={data.page} pageSize={data.pageSize} total={data.total} shown={data.entries.length} />
          </div>
          <div className={`panel tbl-box${isPlaceholderData ? ' stale' : ''}`} aria-busy={isPlaceholderData}>
            <table className="audit">
              <thead><tr><th>Коли</th><th>Хто</th><th>Що</th></tr></thead>
              <tbody>
                {data.entries.map((e) => (
                  <tr key={e.id} className={e.success ? (e.source === 'ui' ? 'ui' : undefined) : 'failed'}>
                    <td className="tight num small">{ftime(e.at)}</td>
                    <td className="small">
                      {e.actor ?? <span className="muted">невідомо</span>}
                      <div className="muted" title={e.userAgent ?? undefined}>{e.ip}</div>
                    </td>
                    <td>
                      <div className="pre">{e.summary}</div>
                      <div className="small muted">
                        <code>{e.action}</code>
                        {e.contractId && !filters.contractId && <> · <Link to={`/audit?contractId=${e.contractId}`}>історія договору #{e.contractId}</Link></>}
                        {e.traceId && <> · trace <code>{e.traceId}</code></>}
                      </div>
                      {e.details != null && (
                        <details className="small">
                          <summary data-audit="Деталі запису журналу">Деталі</summary>
                          <pre>{JSON.stringify(e.details, null, 2)}</pre>
                        </details>
                      )}
                    </td>
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
