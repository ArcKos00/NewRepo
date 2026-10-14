/** Спільні типи API між apps/api і apps/web. Лише типи: імпортуються через `import type`. */

export type ContractStatus = 'waiting' | 'partial' | 'overdue' | 'completed';

export interface FileInfo {
  id: number;
  name: string;
  size: number;
}

/** Найменування договору з порахованими "отримано" та "очікуємо". */
export interface OrderItem {
  id: number;
  name: string;
  unit: string;
  quantity: number;
  received: number;
  cancelled: number;
  cancelReason: string | null;
  pending: number;
}

export interface Totals {
  quantity: number;
  received: number;
  cancelled: number;
  pending: number;
}

export interface ContractSummary {
  id: number;
  number: string;
  counterparty: string;
  contractDate: string;
  expectedDeliveryDate: string | null;
  status: ContractStatus;
  totals: Totals;
  items: OrderItem[];
}

export interface DeliveryLine {
  orderItemId: number;
  quantity: number;
}

export interface Delivery {
  id: number;
  date: string;
  invoiceNumber: string;
  notes: string | null;
  file: FileInfo | null;
  lines: DeliveryLine[];
}

export interface ContractDetails extends ContractSummary {
  notes: string | null;
  file: FileInfo | null;
  deliveries: Delivery[];
}

export interface ContractItemInput {
  id?: number;
  name: string;
  unit: string;
  quantity: number;
}

export interface ContractInput {
  number: string;
  counterparty: string;
  contractDate: string;
  expectedDeliveryDate: string | null;
  notes: string | null;
  items: ContractItemInput[];
}

export interface ShortfallItemInput {
  orderItemId: number;
  cancelled: number;
  cancelReason: string | null;
}

export interface ShortfallInput {
  expectedDeliveryDate: string | null;
  items: ShortfallItemInput[];
}

export interface DeliveryInput {
  date: string;
  invoiceNumber: string;
  notes: string | null;
  lines: DeliveryLine[];
}

export interface ContractSearch {
  number?: string;
  counterparty?: string;
  item?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: ContractStatus;
}

/** Тіло відповіді 422: помилки за шляхом поля ("items.0.quantity"); ключ "_" — загальна. */
export interface ValidationErrorBody {
  statusCode: 422;
  message: string;
  errors: Record<string, string>;
}

// ---------- Журнал дій (аудит) ----------

/** api — дія на сервері (зміна даних, завантаження файлу, невдала спроба); ui — клік/перехід у браузері. */
export type AuditSource = 'api' | 'ui';

/** Групи для фільтра журналу. */
export type AuditKind = 'changes' | 'deletes' | 'failed' | 'files' | 'ui';

export interface AuditEntry {
  id: number;
  at: string;
  source: AuditSource;
  /** contract.create, delivery.delete, ui.click, request.failed, ... */
  action: string;
  success: boolean;
  /** sub з Keycloak */
  actorId: string | null;
  /** ПІБ (логін) на момент дії */
  actor: string | null;
  ip: string | null;
  userAgent: string | null;
  /** Вкладка браузера: зв'язує кліки з діями на сервері */
  tabId: string | null;
  traceId: string | null;
  entityType: string | null;
  entityId: number | null;
  contractId: number | null;
  /** Опис дії людською мовою */
  summary: string;
  /** Знімки "до/після", видалені дані, тіло невдалого запиту тощо */
  details: unknown;
}

export interface AuditSearch {
  kind?: AuditKind;
  actor?: string;
  contractId?: string;
  dateFrom?: string;
  dateTo?: string;
  /** Курсор: записи з id менше за цей */
  before?: string;
}

export interface AuditPage {
  entries: AuditEntry[];
  /** Курсор для наступної сторінки; null — більше немає */
  nextBefore: number | null;
}

export interface UiEvent {
  type: 'click' | 'navigate';
  /** Сторінка (pathname + search), на якій сталася подія */
  path: string;
  /** Підпис елемента, по якому клікнули */
  target?: string;
  /** Посилання, якщо клікнули по <a> */
  href?: string;
  /** Час у браузері (ISO) */
  at: string;
}

/** Пакет подій з браузера. tabId — в тілі, бо sendBeacon не вміє заголовки. */
export interface UiEventBatch {
  tabId?: string | null;
  events: UiEvent[];
}

/** Користувач поточної сесії (з токена Keycloak). */
export interface CurrentUser {
  /** `sub` з Keycloak */
  id: string;
  username: string;
  displayName: string | null;
  /** Коли вхід перестане діяти (epoch ms); null — без Keycloak (AUTH_DISABLED) */
  expiresAt: number | null;
}
