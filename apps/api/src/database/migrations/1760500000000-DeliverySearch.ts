import { MigrationInterface, QueryRunner } from 'typeorm';
import { searchText } from '../../common/text';

/** Пошук поставок за номером накладної (нормалізована копія, як number_search у договорів) і сортування за датою. */
export class DeliverySearch1760500000000 implements MigrationInterface {
  name = 'DeliverySearch1760500000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE deliveries ADD COLUMN invoice_search text NOT NULL DEFAULT ''`);
    // UPPER у JS, а не в БД — так само, як решта *_search (не залежить від локалі БД).
    const rows: { id: number; invoice_number: string }[] = await q.query('SELECT id, invoice_number FROM deliveries');
    for (const r of rows) {
      await q.query('UPDATE deliveries SET invoice_search = $1 WHERE id = $2', [searchText(r.invoice_number), r.id]);
    }
    await q.query(`ALTER TABLE deliveries ALTER COLUMN invoice_search DROP DEFAULT`);
    await q.query(`CREATE INDEX deliveries_date_idx ON deliveries (date DESC, id DESC)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX deliveries_date_idx`);
    await q.query(`ALTER TABLE deliveries DROP COLUMN invoice_search`);
  }
}
