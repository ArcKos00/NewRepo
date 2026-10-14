import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup';
import { config } from '../src/config';

/**
 * База, на яку вже накочено попередню версію журналу (AuditLog1759900000000, вхід admin:admin):
 * нова міграція має зберегти її як audit_log_v1, а не впасти на однакових іменах.
 */
describe('міграція поверх попередньої версії audit_log', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const ds = await new DataSource({ type: 'postgres', url: config.databaseUrl }).initialize();
    await ds.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await ds.query(`
      CREATE TABLE audit_log (
        id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), username text, action text NOT NULL,
        success boolean NOT NULL, method text NOT NULL, path text NOT NULL, status_code integer NOT NULL,
        duration_ms integer NOT NULL, entity_type text, entity_id text, ip text, user_agent text, trace_id text, details jsonb
      );
      CREATE INDEX audit_log_at_idx ON audit_log (at);
      CREATE INDEX audit_log_username_idx ON audit_log (username);
      CREATE INDEX audit_log_action_idx ON audit_log (action);
      CREATE INDEX audit_log_trace_id_idx ON audit_log (trace_id);
      CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id);
      INSERT INTO audit_log (username, action, success, method, path, status_code, duration_ms)
        VALUES ('admin', 'contract.delete', true, 'DELETE', '/api/contracts/1', 204, 5);
    `);
    await ds.destroy();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterAll(() => app.close());

  it('старі записи — в audit_log_v1, новий журнал працює', async () => {
    const ds = app.get(DataSource);
    expect(await ds.query('SELECT username, action FROM audit_log_v1')).toEqual([{ username: 'admin', action: 'contract.delete' }]);
    await ds.query(`INSERT INTO audit_log (source, action, summary) VALUES ('api', 'test', 'перевірка')`);
    expect(await ds.query('SELECT action FROM audit_log')).toEqual([{ action: 'test' }]);
  });
});
