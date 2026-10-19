import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Непідписаний (draft) договір можна зберегти без номера. Унікальний індекс (номер, контрагент)
 * лишається: NULL-и в ньому не конфліктують, тож договорів без номера в контрагента може бути кілька.
 */
export class ContractNumberOptional1760900000000 implements MigrationInterface {
  name = 'ContractNumberOptional1760900000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE contracts ALTER COLUMN number DROP NOT NULL, ALTER COLUMN number_search DROP NOT NULL;
      ALTER TABLE contracts ADD CONSTRAINT contracts_number_unless_draft CHECK (draft OR number IS NOT NULL);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE contracts DROP CONSTRAINT contracts_number_unless_draft;
      UPDATE contracts SET number = '— ' || id, number_search = '— ' || id WHERE number IS NULL;
      ALTER TABLE contracts ALTER COLUMN number SET NOT NULL, ALTER COLUMN number_search SET NOT NULL;
    `);
  }
}
