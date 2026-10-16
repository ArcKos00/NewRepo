import { MigrationInterface, QueryRunner } from 'typeorm';

/** Нерозподілені найменування (pool_items) і їх розподіл по найменуваннях договорів (pool_allocations). */
export class Pool1760600000000 implements MigrationInterface {
  name = 'Pool1760600000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE pool_items (
        id serial PRIMARY KEY,
        name text NOT NULL,
        name_search text NOT NULL,
        unit text NOT NULL,
        quantity numeric(14, 3) NOT NULL CHECK (quantity > 0),
        entered_on date NOT NULL,
        notes text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX pool_items_name_search_idx ON pool_items (name_search);
      CREATE INDEX pool_items_entered_on_idx ON pool_items (entered_on DESC, id DESC);

      CREATE TABLE pool_allocations (
        id serial PRIMARY KEY,
        pool_item_id integer NOT NULL REFERENCES pool_items (id),
        order_item_id integer NOT NULL REFERENCES order_items (id) ON DELETE CASCADE,
        quantity numeric(14, 3) NOT NULL CHECK (quantity > 0)
      );
      CREATE INDEX pool_allocations_pool_item_idx ON pool_allocations (pool_item_id);
      CREATE INDEX pool_allocations_order_item_idx ON pool_allocations (order_item_id);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE pool_allocations, pool_items');
  }
}
