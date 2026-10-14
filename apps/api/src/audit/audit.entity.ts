import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// Індекси (зокрема (entity_type, entity_id)) — у міграції 1759900000000-AuditLog.

/** Журнал дій користувачів: кожен запит до API (крім службових) і кожна спроба входу. */
@Entity('audit_log')
export class AuditLog {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id: string;
  @CreateDateColumn({ type: 'timestamptz' }) at: Date;
  /** Хто: користувач сесії або логін, введений у форму (для auth.login) */
  @Column('text', { nullable: true }) username: string | null;
  @Column('text') action: string;
  @Column('boolean') success: boolean;
  @Column('text') method: string;
  @Column('text') path: string;
  @Column('int') statusCode: number;
  @Column('int') durationMs: number;
  @Column('text', { nullable: true }) entityType: string | null;
  @Column('text', { nullable: true }) entityId: string | null;
  @Column('text', { nullable: true }) ip: string | null;
  @Column('text', { nullable: true }) userAgent: string | null;
  /** Для переходу з журналу в трейс у Kibana/APM */
  @Column('text', { nullable: true }) traceId: string | null;
  /** Параметри запиту (query/body без секретів), опис файлу, текст помилки */
  @Column('jsonb', { nullable: true }) details: Record<string, unknown> | null;
}
