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
