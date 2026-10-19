import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { serveWeb } from '../src/web';

@Controller('api/ping')
class PingController {
  @Get() ping() {
    return { ok: true };
  }
}

@Module({ controllers: [PingController] })
class PingModule {}

/** Кеш під Cloudflare: HTML і API — без кешу, хешовані assets — назавжди, стара збірка — 404. */
describe('роздача фронту і заголовки кешу', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-dist-'));
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    fs.mkdirSync(path.join(dir, 'assets'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><div id="root"></div>');
    fs.writeFileSync(path.join(dir, 'assets', 'index-abc123.js'), 'console.log(1)');
    fs.writeFileSync(path.join(dir, 'favicon.svg'), '<svg/>');
    fs.writeFileSync(path.join(dir, 'version.json'), JSON.stringify({ buildId: 'b42' }));
    const moduleRef = await Test.createTestingModule({ imports: [PingModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    serveWeb(app as NestExpressApplication, dir);
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('index.html і SPA-шляхи — no-store', async () => {
    for (const url of ['/', '/contracts/5', '/index.html']) {
      const res = await http.get(url).expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.text).toContain('id="root"');
    }
  });

  it('хешовані assets — immutable, решта статики — з перевіркою', async () => {
    const js = await http.get('/assets/index-abc123.js').expect(200);
    expect(js.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect((await http.get('/favicon.svg').expect(200)).headers['cache-control']).toBe('no-cache');
  });

  it('неіснуючий asset (стара збірка) — 404 без кешу, не index.html', async () => {
    const res = await http.get('/assets/index-old999.js').expect(404);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.text).not.toContain('id="root"');
  });

  it('API — no-store і версія збірки', async () => {
    const res = await http.get('/api/ping').expect(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-app-build']).toBe('b42');
    // Неіснуючий API — 404 від Nest, а не index.html
    expect((await http.get('/api/nope').expect(404)).headers['cache-control']).toBe('no-store');
  });
});
