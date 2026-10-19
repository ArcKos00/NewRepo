import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { config } from './config';

/**
 * Роздача зібраного фронту і заголовки кешу — з розрахунку на Cloudflare (і будь-який інший CDN/браузер):
 *   * /assets/* — файли з хешем у назві: кешуються назавжди, нова збірка = нові імена;
 *   * index.html (і SPA-фолбек на будь-який шлях) — no-store: після викатки одразу віддається нова збірка,
 *     навіть з правилом «Cache Everything»;
 *   * /api/*, /auth/* — no-store: дані (зокрема анонімні) у кеші CDN не осідають;
 *   * неіснуючий /assets/* — 404 (не index.html), теж no-store: старий кеш вкладки не отримає HTML замість JS.
 * Відкриті вкладки дізнаються про нову збірку із заголовка X-App-Build (див. apps/web/src/version.ts).
 */
const IMMUTABLE = 'public, max-age=31536000, immutable';
const NO_STORE = 'no-store';
const REVALIDATE = 'no-cache';

export const BUILD_HEADER = 'X-App-Build';

/** Ідентифікатор збірки фронту (version.json пише vite.config.ts); null — фронт не зібрано (розробка, тести). */
export function readBuildId(dir = config.webDist): string | null {
  try {
    return (JSON.parse(fs.readFileSync(path.join(dir, 'version.json'), 'utf8')) as { buildId?: string }).buildId ?? null;
  } catch {
    return null;
  }
}

const isApi = (p: string) => p === '/api' || p.startsWith('/api/') || p === '/auth' || p.startsWith('/auth/');

export function serveWeb(app: NestExpressApplication, dir = config.webDist) {
  const buildId = readBuildId(dir);

  // Відповіді API: без кешу і з версією збірки. Контролери (SSE, файли) можуть свої заголовки перевизначити.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (isApi(req.path)) {
      res.setHeader('Cache-Control', NO_STORE);
      if (buildId) res.setHeader(BUILD_HEADER, buildId);
    }
    next();
  });

  if (!fs.existsSync(dir)) return;
  const index = path.join(dir, 'index.html');
  const assets = path.join(dir, 'assets') + path.sep;

  app.use(
    express.static(dir, {
      index: false,
      setHeaders: (res, file) =>
        res.setHeader('Cache-Control', file === index ? NO_STORE : file.startsWith(assets) ? IMMUTABLE : REVALIDATE),
    }),
  );
  app.use((req: Request, res: Response, next: NextFunction) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || isApi(req.path)) return next();
    res.setHeader('Cache-Control', NO_STORE);
    // Файлу з такою назвою немає (стара збірка) — 404, а не index.html.
    if (req.path.startsWith('/assets/')) return res.status(404).type('text/plain').send('Not found');
    res.sendFile(index);
  });
}
