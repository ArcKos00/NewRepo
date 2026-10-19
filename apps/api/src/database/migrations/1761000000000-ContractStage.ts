import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Етап непідписаного договору замість прапорця draft: planned (заплановано) → tender_announced (тендер
 * оголошено) → tender_held (тендер відбувся) → draft (сформовано, не підписано); NULL — підписано.
 * Поки не підписано, номер, контрагент і дата договору можуть бути порожні.
 */
export class ContractStage1761000000000 implements MigrationInterface {
  name = 'ContractStage1761000000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE contracts ADD COLUMN stage text
        CHECK (stage IN ('planned', 'tender_announced', 'tender_held', 'draft'));
      UPDATE contracts SET stage = 'draft' WHERE draft;
      ALTER TABLE contracts DROP CONSTRAINT contracts_number_unless_draft;
      ALTER TABLE contracts DROP COLUMN draft;
      ALTER TABLE contracts
        ALTER COLUMN counterparty DROP NOT NULL,
        ALTER COLUMN counterparty_search DROP NOT NULL,
        ALTER COLUMN contract_date DROP NOT NULL;
      ALTER TABLE contracts ADD CONSTRAINT contracts_signed_complete
        CHECK (stage IS NOT NULL OR (number IS NOT NULL AND counterparty IS NOT NULL AND contract_date IS NOT NULL));
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE contracts DROP CONSTRAINT contracts_signed_complete;
      UPDATE contracts SET counterparty = '—', counterparty_search = '—' WHERE counterparty IS NULL;
      UPDATE contracts SET contract_date = created_at::date WHERE contract_date IS NULL;
      ALTER TABLE contracts
        ALTER COLUMN counterparty SET NOT NULL,
        ALTER COLUMN counterparty_search SET NOT NULL,
        ALTER COLUMN contract_date SET NOT NULL;
      ALTER TABLE contracts ADD COLUMN draft boolean NOT NULL DEFAULT false;
      UPDATE contracts SET draft = stage IS NOT NULL;
      ALTER TABLE contracts DROP COLUMN stage;
      ALTER TABLE contracts ADD CONSTRAINT contracts_number_unless_draft CHECK (draft OR number IS NOT NULL);
    `);
  }
}
