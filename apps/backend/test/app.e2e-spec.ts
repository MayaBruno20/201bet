import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createE2eApplication } from './helpers/bootstrap-app';

describe('201bet API (e2e, mocked Prisma)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e-test-secret-min-32-characters!';
    app = await createE2eApplication();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /api/health', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect((response) => {
        expect(response.body.status).toBe('ok');
        expect(response.body.service).toBe('201bet-backend');
      });
  });

  it('GET /api/market/board returns JSON', () => {
    return request(app.getHttpServer())
      .get('/api/market/board')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('events');
        expect(res.body).toHaveProperty('generatedAt');
      });
  });

  it('POST /api/auth/logout', () => {
    return request(app.getHttpServer()).post('/api/auth/logout').expect(201);
  });
});
