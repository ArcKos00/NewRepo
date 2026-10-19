import { MigrationInterface, QueryRunner } from 'typeorm';

/** Позначка «сформовано, не підписано» на договорі (стан draft). */
export class ContractDraft1760800000000 implements MigrationInterface {
  name = 'ContractDraft1760800000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE contracts ADD COLUMN draft boolean NOT NULL DEFAULT false');
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE contracts DROP COLUMN draft');
  }
}
