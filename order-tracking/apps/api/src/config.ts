import path from 'node:path';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/orders',
  uploadsDir: path.resolve(process.env.UPLOADS_DIR ?? 'data/uploads'),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 50),
  /** Каталог зібраного фронту (apps/web/dist), який Nest роздає в продакшені. */
  webDist: path.resolve(process.env.WEB_DIST ?? path.join(__dirname, '../../web/dist')),
};
