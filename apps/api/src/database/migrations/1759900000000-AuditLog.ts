import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuditLog1759900000000 implements MigrationInterface {
  name = 'AuditLog1759900000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE audit_log (
        id bigserial PRIMARY KEY,
        at timestamptz NOT NULL DEFAULT now(),
        username text,
        action text NOT NULL,
        success boolean NOT NULL,
        method text NOT NULL,
        path text NOT NULL,
        status_code integer NOT NULL,
        duration_ms integer NOT NULL,
        entity_type text,
        entity_id text,
        ip text,
        user_agent text,
        trace_id text,
        details jsonb
      );
      CREATE INDEX audit_log_at_idx ON audit_log (at);
      CREATE INDEX audit_log_username_idx ON audit_log (username);
      CREATE INDEX audit_log_action_idx ON audit_log (action);
      CREATE INDEX audit_log_trace_id_idx ON audit_log (trace_id);
      CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE audit_log');
  }
}
