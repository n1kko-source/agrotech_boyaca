import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/shared/configure-app';
import { ErrorCode } from '../../src/shared/dto/api-error';
import { KernelProbeController } from './kernel-probe.controller';

describe('Shared kernel (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [KernelProbeController],
    }).compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health is public and skip-throttled', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        const body = res.body as {
          status: string;
          service: string;
          redis: { ops: number; limit: number };
        };
        expect(body.status).toBe('ok');
        expect(body.service).toBe('agrotech-backend');
        expect(body.redis.limit).toBe(10_000);
        expect(typeof body.redis.ops).toBe('number');
      });
  });

  it('GET /kernel-probe/protected without JWT returns UNAUTHORIZED', () => {
    return request(app.getHttpServer())
      .get('/kernel-probe/protected')
      .expect(401)
      .expect((res) => {
        const body = res.body as {
          error: { code: string; message: string };
        };
        expect(body.error.code).toBe(ErrorCode.UNAUTHORIZED);
        expect(body.error.message).toBe('Unauthorized');
      });
  });

  it('POST /kernel-probe/validate with invalid body returns VALIDATION_ERROR', () => {
    return request(app.getHttpServer())
      .post('/kernel-probe/validate')
      .send({ name: 1, extra: true })
      .expect(400)
      .expect((res) => {
        const body = res.body as {
          error: { code: string; details?: string[] };
        };
        expect(body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
        expect(body.error.details?.length).toBeGreaterThan(0);
      });
  });

  it('GET /kernel-probe/large with gzip Accept-Encoding is compressed', async () => {
    const res = await request(app.getHttpServer())
      .get('/kernel-probe/large')
      .set('Accept-Encoding', 'gzip')
      .expect(200);

    expect(res.headers['content-encoding']).toBe('gzip');
  });

  it('sets Helmet nosniff on JSON responses', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  it('rejects JSON bodies over 256kb', async () => {
    await request(app.getHttpServer())
      .post('/kernel-probe/validate')
      .send({ name: 'x'.repeat(300_000) })
      .expect(413)
      .expect((res) => {
        const body = res.body as { error: { code: string } };
        expect(body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
      });
  });
});
