import { ValueTransformer } from 'typeorm';

/** numeric/bigint з Postgres приходять рядком — перетворюємо на number. */
export const numeric: ValueTransformer = {
  to: (v?: number | null) => v,
  from: (v?: string | null) => (v === null || v === undefined ? v : Number(v)),
};
