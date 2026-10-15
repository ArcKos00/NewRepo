import fs from 'node:fs';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import type { AuditEntry, AuditPage, ContractDetails } from '@order-tracking/shared';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup';
import { config } from '../src/config';

let app: INestApplication;
let http: ReturnType<typeof request>;

beforeAll(async () => {
  const ds = await new DataSource({ type: 'postgres', url: config.databaseUrl }).initialize();
  await ds.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await ds.destroy();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  setupApp(app);
  await app.init();
  http = request(app.getHttpServer());
});

afterAll(async () => {
  await app.close();
  fs.rmSync(config.uploadsDir, { recursive: true, force: true });
});

const journal = async (query: Record<string, string> = {}) =>
  ((await http.get('/api/audit').query(query).expect(200)).body as AuditPage).entries;

let c: ContractDetails;

describe('журнал дій', () => {
  it('пише створення, редагування, поставки і видалення з описом і знімками', async () => {
    c = (await http.post('/api/contracts').set('X-Tab-Id', 'tab-1').send({
      number: 'А-1', counterparty: 'ТОВ "Ромашка"', contractDate: '2026-09-01', expectedDeliveryDate: null, notes: null,
      items: [{ name: 'Болт', unit: 'шт', quantity: 100 }, { name: 'Гайка', unit: 'шт', quantity: 10 }],
    }).expect(201)).body;
    const [bolt, nut] = c.items;

    await http.put(`/api/contracts/${c.id}`).send({
      number: 'А-1', counterparty: 'ТОВ "Ромашка"', contractDate: '2026-09-01', expectedDeliveryDate: null, notes: 'терміново',
      items: [{ id: bolt.id, name: 'Болт', unit: 'шт', quantity: 120 }],
    }).expect(200);

    await http.post(`/api/contracts/${c.id}/deliveries`)
      .field('data', JSON.stringify({ date: '2026-09-15', invoiceNumber: 'ВН-7', notes: null, lines: [{ orderItemId: bolt.id, quantity: 20 }] }))
      .attach('file', Buffer.from('scan'), 'накладна.pdf')
      .expect(201);
    const withDelivery: ContractDetails = (await http.get(`/api/contracts/${c.id}`).expect(200)).body;
    await http.delete(`/api/deliveries/${withDelivery.deliveries[0].id}`).expect(200);

    const entries = await journal({ contractId: String(c.id) });
    expect(entries.map((e) => e.action)).toEqual(['delivery.delete', 'delivery.create', 'contract.update', 'contract.create']);
    const [del, add, upd, created] = entries;

    expect(created).toMatchObject({ actor: 'Розробник (AUTH_DISABLED) (dev)', actorId: 'dev', tabId: 'tab-1', success: true });
    expect(upd.summary).toContain('видалено найменування Гайка — 10 шт');
    expect(upd.summary).toContain('кількість 100 шт → 120 шт');
    expect(upd.summary).toContain('примітки: — → «терміново»');
    expect(add.summary).toBe('Додано поставку за накладною № ВН-7 від 15.09.2026, договір № А-1 (ТОВ "Ромашка"): Болт — 20 шт; скан «накладна.pdf»');
    expect(del.summary).toMatch(/^Видалено поставку за накладною № ВН-7/);
    expect(del.details).toMatchObject({ before: { invoiceNumber: 'ВН-7', lines: [{ name: 'Болт', quantity: 20 }] } });
    expect(nut.id).toBeGreaterThan(0);
  });

  it('пише невдалі спроби разом з відповіддю сервера', async () => {
    await http.put(`/api/contracts/${c.id}`).send({ number: '', counterparty: '', contractDate: '', items: [] }).expect(422);
    await http.delete('/api/deliveries/999999').expect(404);
    const failed = await journal({ kind: 'failed' });
    expect(failed.map((e) => [e.action, e.success, (e.details as { status: number }).status])).toEqual([
      ['request.failed', false, 404],
      ['request.failed', false, 422],
    ]);
    expect(failed[1].contractId).toBe(c.id);
    expect((failed[1].details as { errors: Record<string, string> }).errors.number).toBe('Вкажіть номер договору');
  });

  it('видалення договору зберігає повний знімок', async () => {
    await http.delete(`/api/contracts/${c.id}`).expect(204);
    const [entry] = await journal({ kind: 'deletes' });
    expect(entry.action).toBe('contract.delete');
    expect(entry.summary).toBe('Видалено договір № А-1 (ТОВ "Ромашка") від 01.09.2026: найменувань 1, поставок 0, файлів 0');
    expect((entry.details as { before: ContractDetails }).before.items[0]).toMatchObject({ name: 'Болт', quantity: 120 });
  });

  it('приймає кліки й переходи з браузера', async () => {
    await http.post('/api/audit/events').send({
      tabId: 'tab-1',
      events: [
        { type: 'navigate', path: `/contracts/${c.id}`, at: new Date().toISOString() },
        { type: 'click', path: `/contracts/${c.id}`, target: 'Видалити', at: new Date().toISOString() },
      ],
    }).expect(204);
    const ui: AuditEntry[] = await journal({ kind: 'ui' });
    expect(ui.map((e) => [e.action, e.summary, e.contractId, e.tabId])).toEqual([
      ['ui.click', `Клік «Видалити» на /contracts/${c.id}`, c.id, 'tab-1'],
      ['ui.navigate', `Перехід на /contracts/${c.id}`, c.id, 'tab-1'],
    ]);
    await http.post('/api/audit/events').send({ events: [{ type: 'hack', path: '/', at: 'x' }] }).expect(422);
  });

  it('записи журналу не можна змінити чи стерти', async () => {
    const ds = app.get(DataSource);
    await expect(ds.query(`UPDATE audit_log SET summary = 'x'`)).rejects.toThrow(/append-only/);
    await expect(ds.query('DELETE FROM audit_log')).rejects.toThrow(/append-only/);
  });
});

describe('доступ', () => {
  afterEach(() => {
    config.authDisabled = true;
  });

  afterEach(() => {
    config.anonymousRead = true;
  });

  it('без входу — лише перегляд: зміни й журнал відповідають 401', async () => {
    config.authDisabled = false;
    await http.get('/api/contracts').expect(200);
    await http.get('/api/contracts/counterparties').expect(200);
    await http.get('/api/contracts/999999').expect(404);
    await http.get('/api/deliveries').expect(200);
    await http.get('/api/files/999999').expect(404);
    await http.post('/api/contracts').send({}).expect(401);
    await http.put('/api/contracts/1').send({}).expect(401);
    await http.delete('/api/contracts/1').expect(401);
    await http.put('/api/contracts/1/shortfall').send({}).expect(401);
    await http.post('/api/contracts/1/deliveries').expect(401);
    await http.delete('/api/deliveries/1').expect(401);
    await http.get('/api/audit').expect(401);
    await http.post('/api/audit/events').send({ events: [] }).expect(401);
    await http.get('/auth/me').expect(401);
  });

  it('ANONYMOUS_READ=false — без входу 401 і на перегляд', async () => {
    config.authDisabled = false;
    config.anonymousRead = false;
    await http.get('/api/contracts').expect(401);
    await http.get('/api/deliveries').expect(401);
    await http.get('/api/files/1').expect(401);
  });

  it('проби health доступні без входу', async () => {
    config.authDisabled = false;
    await http.get('/api/health').expect(200, { status: 'ok' });
    await http.get('/api/health/ready').expect(200, { status: 'ok' });
  });
});

describe('журнал сторінками', () => {
  it('total під фільтр, сторінки без перетину, новіші — першими', async () => {
    const page = async (n: number) =>
      (await http.get('/api/audit').query({ kind: 'changes', page: n, pageSize: 2 }).expect(200)).body as AuditPage;
    const [p1, p2] = [await page(1), await page(2)];
    expect(p1.total).toBeGreaterThan(2);
    expect([p1.page, p1.pageSize, p1.entries.length]).toEqual([1, 2, 2]);
    const ids = [...p1.entries, ...p2.entries].map((e) => e.id);
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
    expect(new Set(ids).size).toBe(ids.length);
    expect((await page(999)).entries).toEqual([]);
    await http.get('/api/audit').query({ pageSize: 201 }).expect(422);
  });
});
