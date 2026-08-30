import { generateKeyPairSync } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { FirebaseEmailClient } from '../../src/auth/email/firebase-email.client';
import { USERS_REPOSITORY } from '../../src/auth/users/users.repository';
import type { UsersRepository } from '../../src/auth/users/users.repository';
import { configureApp } from '../../src/shared/configure-app';
import { ErrorCode } from '../../src/shared/dto/api-error';
import { RedisOpsCounter } from '../../src/shared/redis/redis-ops.counter';

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

describe('Commodities prices (e2e)', () => {
  let app: INestApplication<App>;
  let users: UsersRepository;
  let firebase: FirebaseEmailClient;
  let redisOps: RedisOpsCounter;

  const EMAIL = 'coop-precios@example.com';
  const PASSWORD = 'ClaveSegura1';
  const NIT = '800.197.268-4';
  const ADMIN_EMAIL = 'ops-precios@example.com';
  const ADMIN_PASSWORD = 'AdminClave1';
  const PHONE = '+573001112288';

  beforeAll(async () => {
    process.env.JWT_PRIVATE_KEY = privateKey;
    process.env.JWT_PUBLIC_KEY = publicKey;
    process.env.PII_HASH_PEPPER = 'e2e-pepper';
    process.env.PII_ENCRYPTION_KEY = 'e2e-enc-key';
    delete process.env.FIREBASE_WEB_API_KEY;
    delete process.env.DATABASE_URL;
    delete process.env.REDIS_URL;
    delete process.env.RESEND_API_KEY;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    users = app.get(USERS_REPOSITORY);
    firebase = app.get(FirebaseEmailClient);
    redisOps = app.get(RedisOpsCounter);
    redisOps.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a price only as verified JURIDICA and caches GET', async () => {
    await request(app.getHttpServer())
      .get('/commodities/precios')
      .query({ producto: 'papa', region: 'siachoque' })
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/register/juridica')
      .send({
        email: EMAIL,
        password: PASSWORD,
        nit: NIT,
        entityType: 'cooperativa',
        acceptPrivacyPolicy: true,
      })
      .expect(201);

    const pending = await users.findJuridicaByEmail(EMAIL);
    if (!pending) {
      throw new Error('expected pending juridica');
    }

    const otpSend = await request(app.getHttpServer())
      .post('/auth/otp/send')
      .send({ phone: PHONE })
      .expect(200);
    const otpBody = otpSend.body as { devCode: string };
    const natural = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({
        phone: PHONE,
        code: otpBody.devCode,
        acceptPrivacyPolicy: true,
      })
      .expect(200);
    const naturalToken = (natural.body as { accessToken: string }).accessToken;

    await request(app.getHttpServer())
      .post('/commodities/precios')
      .set('Authorization', `Bearer ${naturalToken}`)
      .send({ producto: 'papa criolla', region: 'siachoque', precio: 2800 })
      .expect(403);

    const signed = await firebase.signUp(ADMIN_EMAIL, ADMIN_PASSWORD);
    await firebase.sendEmailVerification(signed.idToken);
    await users.createAdmin({
      email: ADMIN_EMAIL,
      firebaseUid: signed.localId,
    });
    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login/admin')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);
    const adminToken = (adminLogin.body as { accessToken: string }).accessToken;

    await request(app.getHttpServer())
      .post('/commodities/precios')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ producto: 'papa criolla', region: 'siachoque', precio: 2800 })
      .expect(403);

    const juridicaBeforeVerify = await request(app.getHttpServer())
      .post('/auth/login/juridica')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(403);
    expect(
      (juridicaBeforeVerify.body as { error: { code: string } }).error.code,
    ).toBe(ErrorCode.FORBIDDEN);

    await request(app.getHttpServer())
      .patch(`/admin/juridica/${pending.id}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ verified: true })
      .expect(200);

    const juridicaLogin = await request(app.getHttpServer())
      .post('/auth/login/juridica')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
    const juridicaToken = (juridicaLogin.body as { accessToken: string })
      .accessToken;

    const created = await request(app.getHttpServer())
      .post('/commodities/precios')
      .set('Authorization', `Bearer ${juridicaToken}`)
      .send({
        producto: 'Papa criolla',
        region: 'Siachoque',
        precio: 2800,
        unidad: 'kg',
      })
      .expect(200);
    const createdBody = created.body as {
      producto: string;
      region: string;
      precio: number;
      moneda: string;
      cached: boolean;
    };
    expect(createdBody).toMatchObject({
      producto: 'papa criolla',
      region: 'siachoque',
      precio: 2800,
      moneda: 'COP',
      cached: false,
    });

    const miss = await request(app.getHttpServer())
      .get('/commodities/precios')
      .query({ producto: 'papa criolla', region: 'siachoque' })
      .set('Authorization', `Bearer ${naturalToken}`)
      .expect(200);
    expect((miss.body as { cached: boolean; precio: number }).cached).toBe(
      false,
    );

    const hit = await request(app.getHttpServer())
      .get('/commodities/precios')
      .query({ producto: 'Papa criolla', region: 'Siachoque' })
      .set('Authorization', `Bearer ${naturalToken}`)
      .expect(200);
    expect((hit.body as { cached: boolean; precio: number }).cached).toBe(true);
    expect((hit.body as { precio: number }).precio).toBe(2800);

    await request(app.getHttpServer())
      .post('/commodities/precios')
      .set('Authorization', `Bearer ${juridicaToken}`)
      .send({ producto: 'papa criolla', region: 'siachoque', precio: 3100 })
      .expect(200);

    const afterInvalidate = await request(app.getHttpServer())
      .get('/commodities/precios')
      .query({ producto: 'papa criolla', region: 'siachoque' })
      .set('Authorization', `Bearer ${naturalToken}`)
      .expect(200);
    const afterBody = afterInvalidate.body as {
      cached: boolean;
      precio: number;
    };
    expect(afterBody.cached).toBe(false);
    expect(afterBody.precio).toBe(3100);

    await request(app.getHttpServer())
      .patch(`/admin/juridica/${pending.id}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ verified: false })
      .expect(200);

    await request(app.getHttpServer())
      .post('/commodities/precios')
      .set('Authorization', `Bearer ${juridicaToken}`)
      .send({ producto: 'papa criolla', region: 'siachoque', precio: 4000 })
      .expect(403);

    const missing = await request(app.getHttpServer())
      .get('/commodities/precios')
      .query({ producto: 'uchuva', region: 'tunja' })
      .set('Authorization', `Bearer ${naturalToken}`)
      .expect(404);
    expect((missing.body as { error: { code: string } }).error.code).toBe(
      ErrorCode.NOT_FOUND,
    );

    const health = await request(app.getHttpServer())
      .get('/health')
      .expect(200);
    const healthBody = health.body as {
      status: string;
      redis: { ops: number; limit: number; day: string };
    };
    expect(healthBody.status).toBe('ok');
    expect(healthBody.redis.limit).toBe(10_000);
    expect(healthBody.redis.ops).toBeGreaterThan(0);
    expect(healthBody.redis.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(JSON.stringify(health.body)).not.toContain(EMAIL);
  });
});
