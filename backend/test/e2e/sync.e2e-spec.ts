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

const PHONE = '+573001112291';
const PEER_PHONE = '+573001112292';
const ADMIN_EMAIL = 'ops-sync@example.com';
const ADMIN_PASSWORD = 'ClaveSegura1';
const JURIDICA_EMAIL = 'coop-sync@example.com';
const JURIDICA_PASSWORD = 'ClaveSegura1';
const JURIDICA_NIT = '800.197.268-4';

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

async function naturalToken(
  app: INestApplication<App>,
  phone: string,
): Promise<string> {
  const send = await request(app.getHttpServer())
    .post('/auth/otp/send')
    .send({ phone })
    .expect(200);
  const sendBody = send.body as { devCode?: string };
  const verify = await request(app.getHttpServer())
    .post('/auth/otp/verify')
    .send({
      phone,
      code: sendBody.devCode,
      acceptPrivacyPolicy: true,
    })
    .expect(200);
  return (verify.body as { accessToken: string }).accessToken;
}

describe('Sync (e2e)', () => {
  jest.setTimeout(30_000);
  let app: INestApplication<App>;
  let userToken: string;
  let peerToken: string;
  let adminToken: string;
  let juridicaToken: string;

  beforeAll(async () => {
    process.env.JWT_PRIVATE_KEY = privateKey;
    process.env.JWT_PUBLIC_KEY = publicKey;
    process.env.PII_HASH_PEPPER = 'e2e-pepper';
    process.env.PII_ENCRYPTION_KEY = 'e2e-enc-key';
    delete process.env.FIREBASE_WEB_API_KEY;
    delete process.env.DATABASE_URL;
    delete process.env.REDIS_URL;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    userToken = await naturalToken(app, PHONE);
    peerToken = await naturalToken(app, PEER_PHONE);

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

    await request(app.getHttpServer())
      .post('/auth/register/juridica')
      .send({
        email: JURIDICA_EMAIL,
        password: JURIDICA_PASSWORD,
        nit: JURIDICA_NIT,
        entityType: 'cooperativa',
        acceptPrivacyPolicy: true,
      })
      .expect(201);
    const pending = await users.findJuridicaByEmail(JURIDICA_EMAIL);
    if (!pending) {
      throw new Error('expected pending juridica');
    }
    await request(app.getHttpServer())
      .patch(`/admin/juridica/${pending.id}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ verified: true })
      .expect(200);
    const login = await request(app.getHttpServer())
      .post('/auth/login/juridica')
      .send({ email: JURIDICA_EMAIL, password: JURIDICA_PASSWORD })
      .expect(200);
    juridicaToken = (login.body as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires NATURAL/JURIDICA JWT', async () => {
    await request(app.getHttpServer())
      .post('/sync')
      .send({ ops: [] })
      .expect(401);

    const admin = await request(app.getHttpServer())
      .post('/sync')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ops: [] })
      .expect(403);
    expect((admin.body as { error: { code: string } }).error.code).toBe(
      ErrorCode.FORBIDDEN,
    );
  });

  it('rejects a malformed batch', async () => {
    const res = await request(app.getHttpServer())
      .post('/sync')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ ops: [{ opId: 'nope' }] })
      .expect(400);
    expect((res.body as { error: { code: string } }).error.code).toBe(
      ErrorCode.VALIDATION_ERROR,
    );
  });

  it('pulls an empty delta, applies a client-id post, and is idempotent on retry', async () => {
    const pull = await request(app.getHttpServer())
      .post('/sync')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ ops: [] })
      .expect(200);
    const pullBody = pull.body as {
      serverTime: string;
      results: unknown[];
      delta: { posts: unknown[] };
    };
    expect(pullBody.results).toEqual([]);
    expect(pullBody.delta.posts).toEqual([]);

    const entityId = randomUUID();
    const opId = randomUUID();
    const payload = {
      since: pullBody.serverTime,
      ops: [
        {
          opId,
          entity: 'post',
          entityId,
          clientTs: new Date(Date.now() - 60_000).toISOString(),
          payload: {
            title: 'Papa pastusa',
            description: 'Cosecha de Siachoque',
            category: 'papa',
          },
        },
      ],
    };
    const first = await request(app.getHttpServer())
      .post('/sync')
      .set('Authorization', `Bearer ${userToken}`)
      .send(payload)
      .expect(200);
    const firstBody = first.body as {
      results: Array<{ status: string; entityId: string }>;
      delta: { posts: Array<{ id: string; title: string }> };
    };
    expect(firstBody.results[0]?.status).toBe('applied');
    expect(firstBody.results[0]?.entityId).toBe(entityId);
    expect(firstBody.delta.posts.some((row) => row.id === entityId)).toBe(true);

    const retry = await request(app.getHttpServer())
      .post('/sync')
      .set('Authorization', `Bearer ${userToken}`)
      .send(payload)
      .expect(200);
    const retryBody = retry.body as {
      results: Array<{ status: string; entityId: string }>;
    };
    expect(retryBody.results[0]?.status).toBe('applied');
    expect(retryBody.results[0]?.entityId).toBe(entityId);
  });

  it('keeps LWW on profile and does not abort the batch on a bad op', async () => {
    const newer = new Date(Date.now() - 10_000).toISOString();
    const older = new Date(Date.now() - 120_000).toISOString();
    await request(app.getHttpServer())
      .post('/sync')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        ops: [
          {
            opId: randomUUID(),
            entity: 'profile',
            entityId: randomUUID(),
            clientTs: newer,
            payload: {
              displayName: 'Finca El Rosal',
              municipality: 'Siachoque',
              category: 'papa',
            },
          },
        ],
      })
      .expect(200);

    const mixed = await request(app.getHttpServer())
      .post('/sync')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        ops: [
          {
            opId: randomUUID(),
            entity: 'profile',
            entityId: randomUUID(),
            clientTs: older,
            payload: {
              displayName: 'Nombre viejo',
              municipality: 'Siachoque',
              category: 'papa',
            },
          },
          {
            opId: randomUUID(),
            entity: 'post',
            entityId: randomUUID(),
            clientTs: new Date().toISOString(),
            payload: { title: '' },
          },
          {
            opId: randomUUID(),
            entity: 'alerta',
            entityId: randomUUID(),
            clientTs: new Date().toISOString(),
            payload: { municipio: 'Siachoque', kind: 'rain' },
          },
        ],
      })
      .expect(200);
    const mixedBody = mixed.body as {
      results: Array<{ status: string; record?: { displayName?: string } }>;
    };
    expect(mixedBody.results[0]?.status).toBe('conflict');
    expect(mixedBody.results[0]?.record?.displayName).toBe('Finca El Rosal');
    expect(mixedBody.results[1]?.status).toBe('rejected');
    expect(mixedBody.results[2]?.status).toBe('applied');
  });

  it('syncs a conversation from a peer and rejects precio from NATURAL', async () => {
    const post = await request(app.getHttpServer())
      .post('/posts')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        title: 'Papa criolla',
        description: '50 kg',
        category: 'papa',
      })
      .expect(201);
    const postId = (post.body as { id: string }).id;
    const conversationId = randomUUID();

    const thread = await request(app.getHttpServer())
      .post('/sync')
      .set('Authorization', `Bearer ${peerToken}`)
      .send({
        ops: [
          {
            opId: randomUUID(),
            entity: 'conversation',
            entityId: conversationId,
            clientTs: new Date().toISOString(),
            payload: { postId },
          },
        ],
      })
      .expect(200);
    expect(
      (thread.body as { results: Array<{ status: string; entityId: string }> })
        .results[0]?.entityId,
    ).toBe(conversationId);

    const denied = await request(app.getHttpServer())
      .post('/sync')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        ops: [
          {
            opId: randomUUID(),
            entity: 'precio',
            entityId: randomUUID(),
            clientTs: new Date().toISOString(),
            payload: { producto: 'papa', region: 'siachoque', precio: 2000 },
          },
        ],
      })
      .expect(200);
    expect(
      (denied.body as { results: Array<{ status: string }> }).results[0]
        ?.status,
    ).toBe('rejected');

    const price = await request(app.getHttpServer())
      .post('/sync')
      .set('Authorization', `Bearer ${juridicaToken}`)
      .send({
        ops: [
          {
            opId: randomUUID(),
            entity: 'precio',
            entityId: randomUUID(),
            clientTs: new Date().toISOString(),
            payload: { producto: 'papa', region: 'siachoque', precio: 2000 },
          },
        ],
      })
      .expect(200);
    expect(
      (price.body as { results: Array<{ status: string }> }).results[0]?.status,
    ).toBe('applied');
  });
});
