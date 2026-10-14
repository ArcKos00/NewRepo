import { MigrationInterface, QueryRunner } from 'typeorm';

/** Журнал дій (audit_log) і сесії входу через Keycloak (sessions). */
export class AuditSessions1760400000000 implements MigrationInterface {
  name = 'AuditSessions1760400000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE audit_log (
        id bigserial PRIMARY KEY,
        at timestamptz NOT NULL DEFAULT now(),
        source text NOT NULL CHECK (source IN ('api', 'ui')),
        action text NOT NULL,
        success boolean NOT NULL DEFAULT true,
        actor_id text,
        actor text,
        ip text,
        user_agent text,
        tab_id text,
        trace_id text,
        entity_type text,
        entity_id integer,
        contract_id integer,
        summary text NOT NULL,
        details jsonb
      );
      CREATE INDEX audit_log_at_idx ON audit_log (at);
      CREATE INDEX audit_log_contract_idx ON audit_log (contract_id, id) WHERE contract_id IS NOT NULL;
      CREATE INDEX audit_log_action_idx ON audit_log (action, id);
      CREATE INDEX audit_log_actor_idx ON audit_log (actor_id, id);

      -- Журнал лише доповнюється: застосунок не може змінити чи стерти запис.
      -- Чистка старих кліків — свідомо, власником таблиці: ALTER TABLE audit_log DISABLE TRIGGER audit_log_append_only.
      CREATE FUNCTION audit_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'audit_log is append-only';
      END $$;
      CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
        FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();

      CREATE TABLE sessions (
        sid text PRIMARY KEY,
        sess jsonb NOT NULL,
        expires_at timestamptz NOT NULL
      );
      CREATE INDEX sessions_expires_idx ON sessions (expires_at);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP TABLE sessions;
      DROP TABLE audit_log;
      DROP FUNCTION audit_log_append_only();
    `);
  }
}
