import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import type { ContractDetails, LiveEvent } from '@order-tracking/shared';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup';
import { config } from '../src/config';

let app: INestApplication;
let base: string;

beforeAll(async () => {
  const ds = await new DataSource({ type: 'postgres', url: config.databaseUrl }).initialize();
  await ds.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await ds.destroy();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  setupApp(app);
  await app.listen(0);
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
});

afterAll(async () => {
  await app.close();
  fs.rmSync(config.uploadsDir, { recursive: true, force: true });
});

/** Підписка на /api/events: події з полем data, по одній. */
async function subscribe() {
  const abort = new AbortController();
  const res = await fetch(`${base}/api/events`, { signal: abort.signal });
  expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  const next = async (): Promise<LiveEvent> => {
    for (;;) {
      const end = buffer.indexOf('\n\n');
      if (end >= 0) {
        const chunk = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = chunk.split('\n').find((l) => l.startsWith('data: '));
        if (data && !chunk.includes('event: ping')) return JSON.parse(data.slice(6));
        continue;
      }
      const { value, done } = await reader.read();
      if (done) throw new Error('потік закрито');
      buffer += value;
    }
  };
  return { next, close: () => abort.abort() };
}

const post = (path: string, body: unknown) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// LISTEN підключається асинхронно після старту — чекаємо, поки подія дійде.
async function untilListening() {
  for (let i = 0; i < 50; i++) {
    const ds = app.get(DataSource);
    const [{ n }] = await ds.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE query = 'LISTEN purchase_changes'`);
    if (n > 0) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('LISTEN так і не підключився');
}

describe('живі оновлення (SSE)', () => {
  it('усі підписники отримують подію після збереження, але не після невдалої спроби', async () => {
    await untilListening();
    const [a, b] = [await subscribe(), await subscribe()];
    try {
      // 422 — транзакції з NOTIFY не було, подій нема
      expect((await post('/api/contracts', { number: '' })).status).toBe(422);
      const res = await post('/api/contracts', {
        number: 'SSE-1', counterparty: 'ТОВ "Живі"', contractDate: '2026-10-01', expectedDeliveryDate: null, notes: null,
        items: [{ name: 'Кабель', unit: 'м', quantity: 10 }],
      });
      expect(res.status).toBe(201);
      const created = (await res.json()) as ContractDetails;
      const expected: LiveEvent = { type: 'contract', action: 'created', contractId: created.id };
      expect(await a.next()).toEqual(expected);
      expect(await b.next()).toEqual(expected);

      expect((await fetch(`${base}/api/contracts/${created.id}`, { method: 'DELETE' })).status).toBe(204);
      expect(await a.next()).toEqual({ type: 'contract', action: 'deleted', contractId: created.id });
    } finally {
      a.close();
      b.close();
    }
  });
});
