import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn,
} from 'typeorm';
import { numeric } from './numeric.transformer';

@Entity('files')
export class StoredFile {
  @PrimaryGeneratedColumn() id: number;
  @Column('text') originalName: string;
  @Column('text') storedName: string;
  @Column('text') contentType: string;
  @Column('bigint', { transformer: numeric }) size: number;
  @CreateDateColumn({ type: 'timestamptz' }) uploadedAt: Date;
}

/** Замовлення (договір) */
@Entity('contracts')
@Index(['numberSearch', 'counterpartySearch'], { unique: true })
export class Contract {
  @PrimaryGeneratedColumn() id: number;
  /** Зовнішній номер договору */
  @Column('text') number: string;
  @Column('text') counterparty: string;
  // Нормалізовані (UPPER у JS) копії для пошуку без урахування регістру незалежно від локалі БД.
  @Column('text') numberSearch: string;
  @Column('text') counterpartySearch: string;
  @Index() @Column('date') contractDate: string;
  @Column('date', { nullable: true }) expectedDeliveryDate: string | null;
  @Column('text', { nullable: true }) notes: string | null;
  @Column('int', { nullable: true }) fileId: number | null;
  @ManyToOne(() => StoredFile, { onDelete: 'SET NULL' }) @JoinColumn() file: StoredFile | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @OneToMany(() => OrderItem, (i) => i.contract) items: OrderItem[];
  @OneToMany(() => Delivery, (d) => d.contract) deliveries: Delivery[];
}

/** Найменування (товар) у договорі */
@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn() id: number;
  @Index() @Column('int') contractId: number;
  @ManyToOne(() => Contract, (c) => c.items, { onDelete: 'CASCADE' }) contract: Contract;
  @Column('text') name: string;
  @Index() @Column('text') nameSearch: string;
  @Column('text', { default: 'шт' }) unit: string;
  @Column('numeric', { precision: 14, scale: 3, transformer: numeric }) quantity: number;
  /** "Не зможуть" поставити */
  @Column('numeric', { precision: 14, scale: 3, default: 0, transformer: numeric }) cancelledQuantity: number;
  @Column('text', { nullable: true }) cancelReason: string | null;
}

/** Фактична поставка за накладною */
@Entity('deliveries')
export class Delivery {
  @PrimaryGeneratedColumn() id: number;
  @Index() @Column('int') contractId: number;
  @ManyToOne(() => Contract, (c) => c.deliveries, { onDelete: 'CASCADE' }) contract: Contract;
  @Column('date') date: string;
  @Column('text') invoiceNumber: string;
  /** Нормалізована (UPPER у JS) копія номера накладної для пошуку */
  @Column('text') invoiceSearch: string;
  @Column('int', { nullable: true }) fileId: number | null;
  @ManyToOne(() => StoredFile, { onDelete: 'SET NULL' }) @JoinColumn() file: StoredFile | null;
  @Column('text', { nullable: true }) notes: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @OneToMany(() => DeliveryLine, (l) => l.delivery, { cascade: ['insert'] }) lines: DeliveryLine[];
}

@Entity('delivery_lines')
export class DeliveryLine {
  @PrimaryGeneratedColumn() id: number;
  @Index() @Column('int') deliveryId: number;
  @ManyToOne(() => Delivery, (d) => d.lines, { onDelete: 'CASCADE' }) delivery: Delivery;
  @Index() @Column('int') orderItemId: number;
  // Без каскаду: найменування з поставками видаляти не можна.
  @ManyToOne(() => OrderItem) orderItem: OrderItem;
  @Column('numeric', { precision: 14, scale: 3, transformer: numeric }) quantity: number;
}

/** Нерозподілене найменування: внесене без договору, потім розподіляється по договорах. */
@Entity('pool_items')
export class PoolItem {
  @PrimaryGeneratedColumn() id: number;
  @Column('text') name: string;
  /** Нормалізована (UPPER у JS) копія для пошуку */
  @Index() @Column('text') nameSearch: string;
  @Column('text') unit: string;
  @Column('numeric', { precision: 14, scale: 3, transformer: numeric }) quantity: number;
  /** Дата внесення */
  @Index() @Column('date') enteredOn: string;
  @Column('text', { nullable: true }) notes: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

/**
 * Скільки з нерозподіленого запису пішло в найменування договору. Видалили договір чи найменування —
 * запис зникає каскадом і кількість повертається в нерозподілене.
 */
@Entity('pool_allocations')
export class PoolAllocation {
  @PrimaryGeneratedColumn() id: number;
  @Index() @Column('int') poolItemId: number;
  // Без каскаду: розподілений запис видаляти не можна.
  @ManyToOne(() => PoolItem) poolItem: PoolItem;
  @Index() @Column('int') orderItemId: number;
  @ManyToOne(() => OrderItem, { onDelete: 'CASCADE' }) orderItem: OrderItem;
  @Column('numeric', { precision: 14, scale: 3, transformer: numeric }) quantity: number;
}

/**
 * Журнал дій: хто, коли і що зробив. Без зовнішніх ключів — запис переживає видалення договору.
 * Лише додавання: UPDATE/DELETE заборонені тригером (див. міграцію).
 */
@Entity('audit_log')
export class AuditLog {
  @PrimaryGeneratedColumn({ type: 'bigint' }) id: string;
  @CreateDateColumn({ type: 'timestamptz' }) at: Date;
  @Column('text') source: 'api' | 'ui';
  @Column('text') action: string;
  @Column('boolean', { default: true }) success: boolean;
  @Column('text', { nullable: true }) actorId: string | null;
  @Column('text', { nullable: true }) actor: string | null;
  @Column('text', { nullable: true }) ip: string | null;
  @Column('text', { nullable: true }) userAgent: string | null;
  @Column('text', { nullable: true }) tabId: string | null;
  @Column('text', { nullable: true }) traceId: string | null;
  @Column('text', { nullable: true }) entityType: string | null;
  @Column('int', { nullable: true }) entityId: number | null;
  @Column('int', { nullable: true }) contractId: number | null;
  @Column('text') summary: string;
  @Column('jsonb', { nullable: true }) details: object | null;
}

export const entities = [StoredFile, Contract, OrderItem, Delivery, DeliveryLine, PoolItem, PoolAllocation, AuditLog];
