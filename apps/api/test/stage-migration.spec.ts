import { DataSource } from 'typeorm';
import { config } from '../src/config';
import { entities } from '../src/database/entities';
import { Init1759650000000 } from '../src/database/migrations/1759650000000-Init';
import { AuditSessions1760400000000 } from '../src/database/migrations/1760400000000-AuditSessions';
import { DeliverySearch1760500000000 } from '../src/database/migrations/1760500000000-DeliverySearch';
import { Pool1760600000000 } from '../src/database/migrations/1760600000000-Pool';
import { ContractDraft1760800000000 } from '../src/database/migrations/1760800000000-ContractDraft';
import { ContractNumberOptional1760900000000 } from '../src/database/migrations/1760900000000-ContractNumberOptional';
import { ContractStage1761000000000 } from '../src/database/migrations/1761000000000-ContractStage';

const before = [
  Init1759650000000, AuditSessions1760400000000, DeliverySearch1760500000000, Pool1760600000000,
  ContractDraft1760800000000, ContractNumberOptional1760900000000,
];
const open = (migrations: Function[]) =>
  new DataSource({ type: 'postgres', url: config.databaseUrl, entities, migrations }).initialize();

/** Наявні договори з прапорцем draft після міграції — на етапі «сформовано, не підписано», решта — підписані. */
describe('міграція draft → stage', () => {
  it('draft → stage draft, підписані лишаються підписаними', async () => {
    let ds = await open([]);
    await ds.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await ds.destroy();

    ds = await open(before);
    await ds.runMigrations();
    await ds.query(`
      INSERT INTO contracts (number, counterparty, number_search, counterparty_search, contract_date, draft)
      VALUES ('1', 'А', '1', 'А', '2026-01-01', false), (NULL, 'Б', NULL, 'Б', '2026-01-02', true);
    `);
    await ds.destroy();

    ds = await open([...before, ContractStage1761000000000]);
    await ds.runMigrations();
    expect(await ds.query('SELECT number, stage FROM contracts ORDER BY id')).toEqual([
      { number: '1', stage: null },
      { number: null, stage: 'draft' },
    ]);
    // Підписаний без контрагента — БД не пустить
    await expect(ds.query(`INSERT INTO contracts (number, number_search) VALUES ('2', '2')`)).rejects.toThrow(/contracts_signed_complete/);
    await ds.query(`INSERT INTO contracts (stage) VALUES ('planned')`);
    await ds.destroy();
  });
});
