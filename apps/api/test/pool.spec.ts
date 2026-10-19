import fs from 'node:fs';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import type { ContractDetails, PoolContractInput, PoolItem, PoolItemInput, PoolList } from '@order-tracking/shared';
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

const item = (patch: Partial<PoolItemInput> = {}): PoolItemInput => ({
  name: 'Папір А4', unit: 'пач', quantity: 100, enteredOn: '2026-10-01', notes: null, ...patch,
});

const header = (number: string): Omit<PoolContractInput, 'lines'> => ({
  number, counterparty: 'ТОВ "Канцтовари"', contractDate: '2026-10-10', expectedDeliveryDate: null, notes: null,
});

const add = async (patch: Partial<PoolItemInput> = {}) => (await http.post('/api/pool').send(item(patch)).expect(201)).body as PoolItem;
const byId = async (id: number) =>
  ((await http.get('/api/pool').expect(200)).body as PoolList).items.find((p) => p.id === id)!;

describe('нерозподілені найменування', () => {
  let paperA: PoolItem;
  let paperB: PoolItem;
  let pens: PoolItem;
  let c: ContractDetails;

  it('вносить записи — усі нерозподілені', async () => {
    paperA = await add();
    paperB = await add({ name: 'папір а4 ', quantity: 30, enteredOn: '2026-10-05' });
    pens = await add({ name: 'Ручка синя', unit: 'шт', quantity: 50 });
    expect(paperA).toMatchObject({ quantity: 100, allocated: 0, remaining: 100, status: 'unallocated', allocations: [] });
    await http.post('/api/pool').send(item({ quantity: 0, name: '' })).expect(422);
  });

  it('пошук і фільтр за станом', async () => {
    const list = (await http.get('/api/pool').query({ q: 'папір' }).expect(200)).body as PoolList;
    expect(list.items.map((p) => p.id)).toEqual([paperB.id, paperA.id]);
    const un = (await http.get('/api/pool').query({ status: 'unallocated' }).expect(200)).body as PoolList;
    expect(un.total).toBe(3);
  });

  it('договір з нерозподіленого: однакові найменування — одним рядком, залишок зменшується', async () => {
    const res = await http.post('/api/pool/contract').send({
      ...header('П-1'),
      lines: [
        { poolItemId: paperA.id, quantity: 60 },
        { poolItemId: pens.id, quantity: 50 },
        { poolItemId: paperB.id, quantity: 30 },
      ],
    }).expect(201);
    c = res.body;
    expect(c.items.map((i) => [i.name, i.unit, i.quantity])).toEqual([['Папір А4', 'пач', 90], ['Ручка синя', 'шт', 50]]);

    expect(await byId(paperA.id)).toMatchObject({
      allocated: 60, remaining: 40, status: 'partial', allocations: [{ contractId: c.id, number: 'П-1', quantity: 60 }],
    });
    expect(await byId(paperB.id)).toMatchObject({ remaining: 0, status: 'allocated' });
    expect(await byId(pens.id)).toMatchObject({ remaining: 0, status: 'allocated' });
    const available = (await http.get('/api/pool/available').expect(200)).body as PoolItem[];
    expect(available.map((p) => [p.id, p.remaining])).toEqual([[paperA.id, 40]]);
  });

  it('більше залишку взяти не можна', async () => {
    const res = await http.post('/api/pool/contract').send({
      ...header('П-2'),
      lines: [{ poolItemId: paperA.id, quantity: 30 }, { poolItemId: paperA.id, quantity: 20 }],
    }).expect(422);
    expect(res.body.errors['lines.1.quantity']).toMatch(/Залишилось лише 40/);
    await http.post('/api/pool/contract').send({ ...header('П-2'), lines: [] }).expect(422);
    expect((await byId(paperA.id)).remaining).toBe(40);
  });

  it('договір з нерозподіленого можна позначити «сформовано, не підписано»', async () => {
    const draft = (await http.post('/api/pool/contract').send({
      ...header('П-3'), number: '', draft: true, lines: [{ poolItemId: paperA.id, quantity: 10 }],
    }).expect(201)).body as ContractDetails;
    expect(draft).toMatchObject({ draft: true, status: 'draft', number: null });
    expect((await byId(paperA.id)).remaining).toBe(30);
    await http.delete(`/api/contracts/${draft.id}`).expect(204);
    expect((await byId(paperA.id)).remaining).toBe(40);
  });

  it('з нерозподіленого без номера — лише непідписаний', async () => {
    const res = await http.post('/api/pool/contract').send({
      ...header(''), lines: [{ poolItemId: paperA.id, quantity: 1 }],
    }).expect(422);
    expect(res.body.errors.number).toBeTruthy();
  });

  it('розподілений запис видалити не можна, нерозподілений — можна', async () => {
    await http.delete(`/api/pool/${paperA.id}`).expect(422);
    const extra = await add({ name: 'Скріпки' });
    await http.delete(`/api/pool/${extra.id}`).expect(204);
  });

  it('зменшили кількість у договорі — надлишок повернувся в нерозподілене', async () => {
    await http.put(`/api/contracts/${c.id}`).send({
      ...header('П-1'),
      items: [
        { id: c.items[0].id, name: 'Папір А4', unit: 'пач', quantity: 80 },
        { id: c.items[1].id, name: 'Ручка синя', unit: 'шт', quantity: 50 },
      ],
    }).expect(200);
    // 90 = 60 (A) + 30 (B); останнім розподілено B — з нього й повертається 10
    expect(await byId(paperB.id)).toMatchObject({ allocated: 20, remaining: 10, status: 'partial' });
    expect((await byId(paperA.id)).allocated).toBe(60);
  });

  it('видалили договір — усе повернулося в нерозподілене', async () => {
    await http.delete(`/api/contracts/${c.id}`).expect(204);
    for (const p of [paperA, paperB, pens])
      expect(await byId(p.id)).toMatchObject({ allocated: 0, remaining: p.quantity, status: 'unallocated' });
  });

  it('пише журнал', async () => {
    const { entries } = (await http.get('/api/audit').query({ kind: 'changes', pageSize: 100 }).expect(200)).body;
    const actions = entries.map((e: { action: string }) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['pool.create', 'pool.delete', 'pool.allocate']));
    expect(entries.find((e: { action: string }) => e.action === 'contract.create').summary).toMatch(/з нерозподіленого/);
  });

  it('без входу — лише перегляд', async () => {
    config.authDisabled = false;
    try {
      await http.get('/api/pool').expect(200);
      await http.get('/api/pool/available').expect(200);
      await http.post('/api/pool').send(item()).expect(401);
      await http.delete(`/api/pool/${paperA.id}`).expect(401);
      await http.post('/api/pool/contract').send({ ...header('П-3'), lines: [] }).expect(401);
    } finally {
      config.authDisabled = true;
    }
  });
});
