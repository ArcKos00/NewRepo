/** Спільні типи API між apps/api і apps/web. Лише типи: імпортуються через `import type`. */

/** draft — договір сформовано, але ще не підписано (позначає менеджер); інші стани рахуються з поставок. */
export type ContractStatus = 'draft' | 'waiting' | 'partial' | 'overdue' | 'completed';

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
  /** null — лише в непідписаного (draft) договору */
  number: string | null;
  counterparty: string;
  contractDate: string;
  expectedDeliveryDate: string | null;
  /** Сформовано, не підписано — очікує на подальші дії */
  draft: boolean;
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
  /** Можна не вказувати (null чи ''), лише поки договір не підписано (draft) */
  number: string | null;
  counterparty: string;
  contractDate: string;
  expectedDeliveryDate: string | null;
  notes: string | null;
  /** Сформовано, не підписано; не передали — false */
  draft?: boolean;
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
  /** Загальний пошук: кожне слово має знайтися в номері, контрагенті або найменуванні */
  q?: string;
  number?: string;
  counterparty?: string;
  item?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: ContractStatus;
  /** Сторінка, з 1 */
  page?: number;
  pageSize?: number;
}

export interface ContractList {
  contracts: ContractSummary[];
  /** Скільки всього договорів під фільтр */
  total: number;
  page: number;
  pageSize: number;
}

// ---------- Усі поставки (сторінка «Поставки») ----------

export interface DeliverySearch {
  /** Загальний пошук: кожне слово — у накладній, номері договору, контрагенті або найменуванні поставки */
  q?: string;
  invoice?: string;
  number?: string;
  counterparty?: string;
  item?: string;
  /** Дата поставки */
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface DeliveryRow {
  id: number;
  date: string;
  invoiceNumber: string;
  notes: string | null;
  file: FileInfo | null;
  contract: { id: number; number: string | null; counterparty: string };
  lines: { orderItemId: number; name: string; unit: string; quantity: number }[];
}

export interface DeliveryList {
  deliveries: DeliveryRow[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------- Нерозподілені найменування (сторінка «Нерозподілені») ----------

/** unallocated — ще нічого не пішло в договори; partial — частина; allocated — усе розподілено. */
export type PoolStatus = 'unallocated' | 'partial' | 'allocated';

/** Скільки з запису пішло в договір. */
export interface PoolAllocation {
  contractId: number;
  number: string | null;
  counterparty: string;
  quantity: number;
}

/** Найменування, внесене без договору; потім розподіляється по договорах. */
export interface PoolItem {
  id: number;
  name: string;
  unit: string;
  quantity: number;
  allocated: number;
  /** quantity − allocated */
  remaining: number;
  status: PoolStatus;
  /** Дата внесення */
  enteredOn: string;
  notes: string | null;
  allocations: PoolAllocation[];
}

export interface PoolItemInput {
  name: string;
  unit: string;
  quantity: number;
  enteredOn: string;
  notes: string | null;
}

export interface PoolSearch {
  /** Кожне слово — у найменуванні */
  q?: string;
  status?: PoolStatus;
  /** Дата внесення */
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface PoolList {
  items: PoolItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** Скільки взяти з нерозподіленого запису в новий договір. */
export interface PoolLineInput {
  poolItemId: number;
  quantity: number;
}

/** Новий договір з нерозподіленого: поля договору + що з нерозподіленого взяти. */
export interface PoolContractInput extends Omit<ContractInput, 'items'> {
  lines: PoolLineInput[];
}

// ---------- Живі оновлення (SSE /api/events) ----------

/**
 * Подія зміни даних. Лише id: самі дані клієнт перечитує звичайними запитами (з перевіркою входу).
 * resync — сервер міг пропустити події (перепідключення до БД): перечитати все.
 */
export type LiveEvent =
  | { type: 'contract'; action: 'created' | 'updated' | 'deleted'; contractId: number }
  | { type: 'pool' }
  | { type: 'resync' };

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
  /** Сторінка, з 1 */
  page?: number;
  pageSize?: number;
}

export interface AuditPage {
  entries: AuditEntry[];
  /** Скільки всього записів під фільтр */
  total: number;
  page: number;
  pageSize: number;
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
  /** Адміністратор: бачить журнал дій */
  admin: boolean;
  /** Коли вхід перестане діяти (epoch ms); null — без Keycloak (AUTH_DISABLED) */
  expiresAt: number | null;
}
