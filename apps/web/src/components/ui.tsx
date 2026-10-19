import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { ContractStage, ContractStatus, PoolStatus } from '@order-tracking/shared';
import { ApiError } from '../api';
import { POOL_STATUS_TEXT, STAGES, STATUS_TEXT } from '../format';

export function StatusPill({ status }: { status: ContractStatus }) {
  return <span className={`pill st-${status}`}>{STATUS_TEXT[status]}</span>;
}

export function PoolStatusPill({ status }: { status: PoolStatus }) {
  return <span className={`pill ps-${status}`}>{POOL_STATUS_TEXT[status]}</span>;
}

/** Етап договору у формах: до підписання (заплановано → … → сформовано) або «Підписано» (null). */
export function StageSelect({ id, value, onChange }: { id?: string; value: ContractStage | null; onChange: (v: ContractStage | null) => void }) {
  return (
    <label className="f">Етап
      <select id={id} value={value ?? ''} onChange={(e) => onChange((e.target.value || null) as ContractStage | null)}>
        {STAGES.map((s) => <option key={s} value={s}>{STATUS_TEXT[s]}</option>)}
        <option value="">Підписано</option>
      </select>
    </label>
  );
}

/** Модальне вікно (нативний <dialog>): Esc і клік повз — закрити, фокус лишається всередині. */
export function Modal({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-b">
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

/** Смуга виконання: зелене — отримано, червоне — не зможуть. */
export function ProgressBar({ total, received, cancelled }: { total: number; received: number; cancelled: number }) {
  const t = total > 0 ? total : 1;
  const rec = (received / t) * 100;
  const can = (cancelled / t) * 100;
  return (
    <div className="bar" title={`Отримано ${Math.round(rec)}% · Не зможуть ${Math.round(can)}%`}>
      <i className="rec" style={{ width: `${rec}%` }} />
      <i className="can" style={{ width: `${can}%` }} />
    </div>
  );
}

export function FieldError({ message }: { message?: string }) {
  return message ? <div className="err">{message}</div> : null;
}

/** Загальна помилка форми: "_" з 422 або будь-яка інша помилка запиту. */
export function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  if (error instanceof ApiError) {
    if (error.status === 422 && !error.errors._) return <div className="alert bad">{error.message}</div>;
    return <div className="alert bad">{error.errors._ ?? error.message}</div>;
  }
  return <div className="alert bad">Не вдалося виконати запит.</div>;
}

/**
 * Помилки полів з останньої відповіді 422. Помилка поля ховається, щойно користувач
 * змінив це поле (`touch(key)`), і з'являється знову лише після наступного збереження.
 */
export function useFieldErrors(error: unknown) {
  const [touched, setTouched] = useState<Set<string>>(new Set());
  useEffect(() => setTouched(new Set()), [error]);
  const errors = error instanceof ApiError ? error.errors : {};
  return {
    err: (key: string) => (touched.has(key) ? undefined : errors[key]),
    touch: (key: string) => {
      if (errors[key] && !touched.has(key)) setTouched(new Set(touched).add(key));
    },
  };
}

/** Кнопка з підтвердженням другим натисканням. */
export function ConfirmButton({ children, confirmText, onConfirm, className = 'btn danger', disabled }: {
  children: ReactNode;
  confirmText: string;
  onConfirm: () => void;
  className?: string;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="button"
      className={`${className}${armed ? ' armed' : ''}`}
      disabled={disabled}
      onClick={() => (armed ? onConfirm() : setArmed(true))}
      onBlur={() => setArmed(false)}
    >
      {armed ? confirmText : children}
    </button>
  );
}

export function Loading() {
  return <div className="panel empty">Завантаження…</div>;
}

export function LoadError({ error }: { error: unknown }) {
  const message = error instanceof ApiError ? error.message : 'Не вдалося завантажити дані.';
  return <div className="panel empty">{message}</div>;
}
