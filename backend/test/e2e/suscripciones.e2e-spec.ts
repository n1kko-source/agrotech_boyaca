import { randomUUID } from 'node:crypto';
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
import { CLOCK } from '../../src/suscripciones/clock';
import {
  SUSCRIPCION_GRACE_MS,
  SUSCRIPCION_PERIOD_MS,
} from '../../src/suscripciones/suscripciones.constants';

const PHONE = '+573001112301';
const ADMIN_EMAIL = 'ops-sub@example.com';
const ADMIN_PASSWORD = 'AdminClave1';
const JOB_SECRET = 'sub-e2e-job-secret';
const T0 = new Date('2026-09-01T12:00:00.000Z');

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

describe('Suscripciones (e2e AG-29)', () => {
  jest.setTimeout(30_000);
  let app: INestApplication<App>;
  let now: Date;
  let token: string;
  let userId: string;
  let adminToken: string;

  beforeAll(async () => {
    now = new Date(T0);
    process.env.JWT_PRIVATE_KEY = privateKey;
    process.env.JWT_PUBLIC_KEY = publicKey;
    process.env.PII_HASH_PEPPER = 'e2e-pepper';
    process.env.PII_ENCRYPTION_KEY = 'e2e-enc-key';
    process.env.SUSCRIPCIONES_JOB_SECRET = JOB_SECRET;
    delete process.env.FIREBASE_WEB_API_KEY;
    delete process.env.DATABASE_URL;
    delete process.env.REDIS_URL;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CLOCK)
      .useValue(() => now)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    const send = await request(app.getHttpServer())
      .post('/auth/otp/send')
      .send({ phone: PHONE })
      .expect(200);
    const verify = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({
        phone: PHONE,
        code: (send.body as { devCode?: string }).devCode,
        acceptPrivacyPolicy: true,
      })
      .expect(200);
    token = (verify.body as { accessToken: string }).accessToken;
    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    userId = (me.body as { sub: string }).sub;

    const users = app.get<UsersRepository>(USERS_REPOSITORY);
    const firebase = app.get(FirebaseEmailClient);
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
    adminToken = (adminLogin.body as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated me and admin payment; ADMIN cannot read me', async () => {
    await request(app.getHttpServer()).get('/suscripciones/me').expect(401);
    await request(app.getHttpServer())
      .post(`/admin/suscripciones/${userId}/pagos`)
      .send({ channel: 'nequi' })
      .expect(401);

    const forbidden = await request(app.getHttpServer())
      .get('/suscripciones/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
    expect((forbidden.body as { error: { code: string } }).error.code).toBe(
      ErrorCode.FORBIDDEN,
    );
  });

  it('starts vencida, hides search, and still applies a sync write', async () => {
    const mine = await request(app.getHttpServer())
      .get('/suscripciones/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(mine.body).toEqual({
      status: 'vencida',
      currentPeriodEnd: null,
      graceEndsAt: null,
    });

    await request(app.getHttpServer())
      .post('/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Papa criolla de Siachoque',
        description: 'Bultos de 50 kg',
        category: 'papa',
      })
      .expect(201);

    const hidden = await request(app.getHttpServer())
      .get('/posts/search')
      .query({ q: 'papa criolla' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((hidden.body as { items: unknown[] }).items).toEqual([]);

    const sync = await request(app.getHttpServer())
      .post('/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ops: [
          {
            opId: randomUUID(),
            entity: 'post',
            entityId: randomUUID(),
            clientTs: new Date(now.getTime() - 60_000).toISOString(),
            payload: {
              title: 'Cebolla cabezona',
              description: 'Roja',
              category: 'cebolla',
            },
          },
        ],
      })
      .expect(200);
    expect(
      (sync.body as { results: Array<{ status: string }> }).results[0]?.status,
    ).toBe('applied');
  });

  it('lists after admin payment without exposing grace on the public DTO', async () => {
    const naturalPay = await request(app.getHttpServer())
      .post(`/admin/suscripciones/${userId}/pagos`)
      .set('Authorization', `Bearer ${token}`)
      .send({ channel: 'nequi' })
      .expect(403);
    expect((naturalPay.body as { error: { code: string } }).error.code).toBe(
      ErrorCode.FORBIDDEN,
    );

    const paid = await request(app.getHttpServer())
      .post(`/admin/suscripciones/${userId}/pagos`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ channel: 'nequi', reference: 'NEQUI-29' })
      .expect(200);
    const paidBody = paid.body as {
      status: string;
      currentPeriodEnd: string;
    };
    expect(paidBody.status).toBe('activa');

    const dup = await request(app.getHttpServer())
      .post(`/admin/suscripciones/${userId}/pagos`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ channel: 'nequi', reference: 'NEQUI-29' })
      .expect(409);
    expect((dup.body as { error: { code: string } }).error.code).toBe(
      ErrorCode.CONFLICT,
    );

    await request(app.getHttpServer())
      .put('/profiles/me')
      .set('Authorization', `Bearer ${token}`)
      .send({
        displayName: 'Finca El Rosal',
        municipality: 'Siachoque',
        category: 'papa',
        bio: 'Papa pastusa',
      })
      .expect(200);

    const posts = await request(app.getHttpServer())
      .get('/posts/search')
      .query({ q: 'papa criolla' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const postPage = posts.body as {
      items: Array<{ title: string; en_gracia?: unknown }>;
    };
    expect(postPage.items.length).toBeGreaterThan(0);
    expect(JSON.stringify(posts.body)).not.toContain('en_gracia');

    const profiles = await request(app.getHttpServer())
      .get('/profiles/search')
      .query({ q: 'Siachoqe' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((profiles.body as { items: unknown[] }).items).toHaveLength(1);
    expect(JSON.stringify(profiles.body)).not.toContain('en_gracia');
  });

  it('keeps the listing in grace and hides it after, with idempotent job pushes', async () => {
    await request(app.getHttpServer())
      .post('/suscripciones/jobs/evaluate')
      .expect(401);
    await request(app.getHttpServer())
      .post('/suscripciones/jobs/evaluate')
      .set('x-suscripciones-job-secret', 'wrong')
      .expect(401);

    const periodEnd = new Date(T0.getTime() + SUSCRIPCION_PERIOD_MS);
    now = new Date(periodEnd.getTime() - 3 * 24 * 60 * 60 * 1000);
    const first = await request(app.getHttpServer())
      .post('/suscripciones/jobs/evaluate')
      .set('x-suscripciones-job-secret', JOB_SECRET)
      .expect(200);
    expect(first.body).toEqual({ evaluated: 1, fired: 1 });
    const again = await request(app.getHttpServer())
      .post('/suscripciones/jobs/evaluate')
      .set('x-suscripciones-job-secret', JOB_SECRET)
      .expect(200);
    expect(again.body).toEqual({ evaluated: 1, fired: 0 });

    now = new Date(periodEnd.getTime() + 1);
    const graceMe = await request(app.getHttpServer())
      .get('/suscripciones/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((graceMe.body as { status: string }).status).toBe('en_gracia');
    const stillListed = await request(app.getHttpServer())
      .get('/posts/search')
      .query({ q: 'papa criolla' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      (stillListed.body as { items: unknown[] }).items.length,
    ).toBeGreaterThan(0);
    await request(app.getHttpServer())
      .post('/suscripciones/jobs/evaluate')
      .set('x-suscripciones-job-secret', JOB_SECRET)
      .expect(200);

    now = new Date(periodEnd.getTime() + SUSCRIPCION_GRACE_MS + 1);
    const hiddenMe = await request(app.getHttpServer())
      .get('/suscripciones/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((hiddenMe.body as { status: string }).status).toBe('vencida');
    const gone = await request(app.getHttpServer())
      .get('/posts/search')
      .query({ q: 'papa criolla' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((gone.body as { items: unknown[] }).items).toEqual([]);
    const profiles = await request(app.getHttpServer())
      .get('/profiles/search')
      .query({ q: 'Siachoqe' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((profiles.body as { items: unknown[] }).items).toEqual([]);

    const hideJob = await request(app.getHttpServer())
      .post('/suscripciones/jobs/evaluate')
      .set('x-suscripciones-job-secret', JOB_SECRET)
      .expect(200);
    expect((hideJob.body as { fired: number }).fired).toBe(1);
    const hideAgain = await request(app.getHttpServer())
      .post('/suscripciones/jobs/evaluate')
      .set('x-suscripciones-job-secret', JOB_SECRET)
      .expect(200);
    expect(hideAgain.body).toEqual({ evaluated: 1, fired: 0 });

    const inbox = await request(app.getHttpServer())
      .get('/notifications/pending')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const kinds = (
      inbox.body as { items: Array<{ data: { kind?: string } }> }
    ).items.map((item) => item.data.kind);
    expect(kinds.filter((kind) => kind === 'expiry_soon')).toHaveLength(1);
    expect(kinds.filter((kind) => kind === 'grace')).toHaveLength(1);
    expect(kinds.filter((kind) => kind === 'hidden')).toHaveLength(1);
  });
});
