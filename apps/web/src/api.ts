import type {
  AuditPage, AuditSearch, ContractDetails, ContractInput, ContractStage, ContractList, ContractSearch, CurrentUser, DeliveryInput,
  DeliveryList, DeliverySearch, PoolContractInput, PoolItem, PoolItemInput, PoolList, PoolSearch, ShortfallInput,
  ValidationErrorBody,
} from '@order-tracking/shared';
import { tabId } from './tracking';
import { checkBuild } from './version';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Помилки полів: "items.0.quantity" → текст; "_" — загальна */
    readonly errors: Record<string, string> = {},
  ) {
    super(message);
  }
}

/** На сторінку входу, з поверненням туди, де були. */
export function goToLogin() {
  if (window.location.pathname === '/login') return;
  const back = window.location.pathname + window.location.search;
  window.location.assign(`/login?returnTo=${encodeURIComponent(back)}`);
}

/** `url` з префіксом: /api/... — дані, /auth/... — вхід. */
async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'X-Tab-Id': tabId };
  const init: RequestInit = { method, headers, credentials: 'same-origin' };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }

  let res: Response;
  try {
    res = await fetch(url.startsWith('/auth/') ? url : `/api${url}`, init);
  } catch {
    throw new ApiError(0, 'Немає зв’язку з сервером. Перевірте мережу і спробуйте ще раз.');
  }
  checkBuild(res);
  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 422) {
      const v = data as ValidationErrorBody;
      throw new ApiError(422, v.message, v.errors);
    }
    if (res.status === 413) throw new ApiError(413, 'Файл завеликий.');
    // сесія закінчилась — на вхід (крім самих запитів входу: там 401 — це «невірний пароль»)
    if (res.status === 401 && !url.startsWith('/auth/')) {
      goToLogin();
      throw new ApiError(401, 'Сесія закінчилась — увійдіть знову.');
    }
    const message = typeof data?.message === 'string' ? data.message : 'Не вдалося виконати запит.';
    throw new ApiError(res.status, message);
  }
  return data as T;
}

const qs = (params: object) => {
  const s = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== ''),
  ).toString();
  return s ? `?${s}` : '';
};

export const api = {
  search: (f: ContractSearch) => request<ContractList>('GET', `/contracts${qs(f)}`),
  deliveries: (f: DeliverySearch) => request<DeliveryList>('GET', `/deliveries${qs(f)}`),
  get: (id: number) => request<ContractDetails>('GET', `/contracts/${id}`),
  counterparties: () => request<string[]>('GET', '/contracts/counterparties'),
  create: (input: ContractInput) => request<ContractDetails>('POST', '/contracts', input),
  update: (id: number, input: ContractInput) => request<ContractDetails>('PUT', `/contracts/${id}`, input),
  remove: (id: number) => request<void>('DELETE', `/contracts/${id}`),
  setFile: (id: number, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return request<ContractDetails>('PUT', `/contracts/${id}/file`, fd);
  },
  removeFile: (id: number) => request<ContractDetails>('DELETE', `/contracts/${id}/file`),
  setStage: (id: number, stage: ContractStage | null) => request<ContractDetails>('PUT', `/contracts/${id}/stage`, { stage }),
  updateShortfall: (id: number, input: ShortfallInput) =>
    request<ContractDetails>('PUT', `/contracts/${id}/shortfall`, input),
  addDelivery: (id: number, input: DeliveryInput, file?: File | null) => {
    const fd = new FormData();
    fd.append('data', JSON.stringify(input));
    if (file) fd.append('file', file);
    return request<ContractDetails>('POST', `/contracts/${id}/deliveries`, fd);
  },
  removeDelivery: (id: number) => request<{ contractId: number }>('DELETE', `/deliveries/${id}`),
  fileUrl: (id: number) => `/api/files/${id}`,

  pool: (f: PoolSearch) => request<PoolList>('GET', `/pool${qs(f)}`),
  poolAvailable: () => request<PoolItem[]>('GET', '/pool/available'),
  addPool: (input: PoolItemInput) => request<PoolItem>('POST', '/pool', input),
  removePool: (id: number) => request<void>('DELETE', `/pool/${id}`),
  createFromPool: (input: PoolContractInput) => request<ContractDetails>('POST', '/pool/contract', input),

  me: () => request<CurrentUser>('GET', '/auth/me'),
  logout: () => request<{ logoutUrl: string | null }>('POST', '/auth/logout'),
  ssoLoginUrl: (returnTo: string) => `/auth/login?returnTo=${encodeURIComponent(returnTo)}`,

  audit: (f: AuditSearch) => request<AuditPage>('GET', `/audit${qs(f)}`),
};
