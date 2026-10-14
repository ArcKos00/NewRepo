import fs from 'node:fs';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import type { ContractDetails, ContractInput, ContractSummary } from '@order-tracking/shared';
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

const contract = (patch: Partial<ContractInput> = {}): ContractInput => ({
  number: 'Д-125/2026',
  counterparty: 'ТОВ "Постачальник"',
  contractDate: '2026-09-01',
  expectedDeliveryDate: '2099-10-20',
  notes: null,
  items: [
    { name: 'Болт М8', unit: 'шт', quantity: 100 },
    { name: 'Гайка М8', unit: 'шт', quantity: 50 },
  ],
  ...patch,
});

const delivery = (id: number, lines: { orderItemId: number; quantity: number }[], invoiceNumber = 'ВН-001') =>
  http.post(`/api/contracts/${id}/deliveries`)
    .field('data', JSON.stringify({ date: '2026-09-15', invoiceNumber, notes: null, lines }));

let c: ContractDetails;

describe('повний цикл замовлення', () => {
  it('створює договір з найменуваннями', async () => {
    const res = await http.post('/api/contracts').send(contract()).expect(201);
    c = res.body;
    expect(c.status).toBe('waiting');
    expect(c.items.map((i) => [i.name, i.quantity, i.pending])).toEqual([['Болт М8', 100, 100], ['Гайка М8', 50, 50]]);
  });

  it('прикріплює файл договору з кириличною назвою', async () => {
    const res = await http.put(`/api/contracts/${c.id}/file`).attach('file', Buffer.from('pdf'), 'Договір 125.pdf').expect(200);
    expect(res.body.file).toMatchObject({ name: 'Договір 125.pdf', size: 3 });
    const file = await http.get(`/api/files/${res.body.file.id}`).expect(200);
    expect(file.headers['content-disposition']).toContain('attachment');
  });

  it('100 замовлено, 20 отримали, 20 не зможуть → 60 очікуємо', async () => {
    const [bolt] = c.items;
    await delivery(c.id, [{ orderItemId: bolt.id, quantity: 20 }])
      .attach('file', Buffer.from('scan'), 'nakladna.pdf')
      .expect(201);

    const res = await http.put(`/api/contracts/${c.id}/shortfall`).send({
      expectedDeliveryDate: '2099-10-25',
      items: [{ orderItemId: bolt.id, cancelled: 20, cancelReason: 'Немає на складі' }],
    }).expect(200);

    const updated: ContractDetails = res.body;
    expect(updated.items[0]).toMatchObject({ received: 20, cancelled: 20, pending: 60, cancelReason: 'Немає на складі' });
    expect(updated.status).toBe('partial');
    expect(updated.expectedDeliveryDate).toBe('2099-10-25');
    expect(updated.deliveries[0]).toMatchObject({ invoiceNumber: 'ВН-001', file: { name: 'nakladna.pdf' } });
  });

  it('не приймає більше, ніж очікується', async () => {
    const res = await delivery(c.id, [{ orderItemId: c.items[0].id, quantity: 61 }], 'ВН-002').expect(422);
    expect(res.body.errors['lines.0.quantity']).toBe('Очікується лише 60');
  });

  it('вимагає хоча б одну ненульову кількість у поставці', async () => {
    const res = await delivery(c.id, [{ orderItemId: c.items[0].id, quantity: 0 }], 'ВН-003').expect(422);
    expect(res.body.errors._).toMatch(/хоча б по одному/);
  });

  it('не дає зменшити кількість нижче отриманого + не зможуть', async () => {
    const res = await http.put(`/api/contracts/${c.id}`).send(contract({
      items: [{ id: c.items[0].id, name: 'Болт М8', unit: 'шт', quantity: 30 }, { id: c.items[1].id, name: 'Гайка М8', unit: 'шт', quantity: 50 }],
    })).expect(422);
    expect(res.body.errors['items.0.quantity']).toMatch(/Не менше 40/);
  });

  it('не дає видалити найменування, по якому були поставки', async () => {
    const res = await http.put(`/api/contracts/${c.id}`).send(contract({
      items: [{ id: c.items[1].id, name: 'Гайка М8', unit: 'шт', quantity: 50 }],
    })).expect(422);
    expect(res.body.errors._).toMatch(/Не можна видалити «Болт М8»/);
  });

  it('редагує: змінює кількість, видаляє і додає найменування', async () => {
    const res = await http.put(`/api/contracts/${c.id}`).send(contract({
      items: [
        { id: c.items[0].id, name: 'Болт М8', unit: 'шт', quantity: 120 },
        { name: 'Шайба 8', unit: 'кг', quantity: 12.5 },
      ],
    })).expect(200);
    expect(res.body.items.map((i: { name: string; quantity: number; pending: number }) => [i.name, i.quantity, i.pending]))
      .toEqual([['Болт М8', 120, 80], ['Шайба 8', 12.5, 12.5]]);
  });
});

describe('валідація', () => {
  it('повертає помилки за полями', async () => {
    const res = await http.post('/api/contracts').send({
      number: '', counterparty: '', contractDate: '', expectedDeliveryDate: null, notes: null,
      items: [{ name: 'a', unit: 'шт', quantity: null }],
    }).expect(422);
    expect(res.body.errors).toMatchObject({
      number: 'Вкажіть номер договору',
      counterparty: 'Вкажіть контрагента',
      contractDate: 'Вкажіть дату договору',
      'items.0.quantity': expect.stringMatching(/Вкажіть кількість/),
    });
  });

  it('вимагає хоча б одне найменування', async () => {
    const res = await http.post('/api/contracts').send(contract({ number: 'X-1', items: [] })).expect(422);
    expect(res.body.errors._).toBe('Додайте хоча б одне найменування.');
  });

  it('не дозволяє дублювати номер у того самого контрагента (без урахування регістру)', async () => {
    const res = await http.post('/api/contracts').send(contract({ number: 'д-125/2026', counterparty: 'тов "постачальник"' })).expect(422);
    expect(res.body.errors.number).toMatch(/вже існує/);
  });
});

describe('пошук', () => {
  beforeAll(async () => {
    await http.post('/api/contracts').send(contract({
      number: 'ПС-7', counterparty: 'ПП Іваненко', contractDate: '2025-03-10', expectedDeliveryDate: null,
      items: [{ name: 'Фарба біла', unit: 'кг', quantity: 60 }],
    })).expect(201);
  });

  const found = async (query: Record<string, string>) =>
    ((await http.get('/api/contracts').query(query).expect(200)).body as ContractSummary[]).map((x) => x.number);

  it('за номером, контрагентом, найменуванням, датою і станом', async () => {
    expect(await found({ number: 'пс-7' })).toEqual(['ПС-7']);
    expect(await found({ counterparty: 'іваненко' })).toEqual(['ПС-7']);
    expect(await found({ item: 'БОЛТ' })).toEqual(['Д-125/2026']);
    expect(await found({ dateFrom: '2025-01-01', dateTo: '2025-12-31' })).toEqual(['ПС-7']);
    expect(await found({ status: 'partial' })).toEqual(['Д-125/2026']);
    expect(await found({ item: '%' })).toEqual([]);
    expect(await found({})).toEqual(['Д-125/2026', 'ПС-7']);
  });
});

describe('видалення', () => {
  it('видаляє поставку і договір разом з файлами', async () => {
    const details: ContractDetails = (await http.get(`/api/contracts/${c.id}`).expect(200)).body;
    await http.delete(`/api/deliveries/${details.deliveries[0].id}`).expect(200);
    await http.delete(`/api/contracts/${c.id}`).expect(204);
    await http.get(`/api/contracts/${c.id}`).expect(404);
    expect(fs.readdirSync(config.uploadsDir)).toEqual([]);
  });
});
