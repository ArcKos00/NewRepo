import fs from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

// Без прав адміна: змінна має бути задана до першого імпорту config, тому застосунок — динамічним import.
process.env.DEV_USER_ADMIN = 'false';

let app: INestApplication;
let http: ReturnType<typeof request>;
let uploadsDir: string;

beforeAll(async () => {
  const { Test } = await import('@nestjs/testing');
  const { AppModule } = await import('../src/app.module');
  const { setupApp } = await import('../src/setup');
  uploadsDir = (await import('../src/config')).config.uploadsDir;
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  setupApp(app);
  await app.init();
  http = request(app.getHttpServer());
});

afterAll(async () => {
  await app.close();
  fs.rmSync(uploadsDir, { recursive: true, force: true });
});

describe('журнал — лише адміністратору', () => {
  it('без ролі: журнал 403, решта API і запис кліків працюють', async () => {
    expect((await http.get('/auth/me').expect(200)).body.admin).toBe(false);
    const res = await http.get('/api/audit').expect(403);
    expect(res.body.message).toBe('Лише для адміністратора');
    await http.get('/api/contracts').expect(200);
    await http.post('/api/audit/events')
      .send({ tabId: 't', events: [{ type: 'navigate', path: '/contracts', at: new Date().toISOString() }] })
      .expect(204);
  });

  it('роль береться з ролей користувача в realm, а не з ролей клієнта', async () => {
    const { realmRoles } = await import('../src/auth/oidc.service');
    expect(realmRoles({ realm_access: { roles: ['admin', 7, 'offline_access'] } })).toEqual(['admin', 'offline_access']);
    expect(realmRoles({ resource_access: { purchase: { roles: ['admin'] } } })).toEqual([]);
    expect(realmRoles({})).toEqual([]);
  });
});
