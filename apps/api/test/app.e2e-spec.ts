import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/common/app-config';

describe('API Foundation (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    if (process.env.TEST_DATABASE_URL?.trim()) {
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL.trim();
    }
    if (!process.env.JWT_SECRET?.trim()) {
      process.env.JWT_SECRET = 'test-jwt-secret-brewlite-integration';
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET / returns Hello World', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('GET /health returns {"status":"ok"}', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('GET /health with correct Origin returns CORS header', () => {
    return request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'http://localhost:3000')
      .expect(200)
      .expect('access-control-allow-origin', 'http://localhost:3000');
  });

  it('Non-existent path returns 404 with correct format', () => {
    return request(app.getHttpServer())
      .get('/non-existent-path-xyz')
      .expect(404)
      .expect((res) => {
        expect(res.body).toHaveProperty('statusCode', 404);
        expect(res.body).toHaveProperty('message');
        expect(res.body).toHaveProperty('error');
      });
  });
});
