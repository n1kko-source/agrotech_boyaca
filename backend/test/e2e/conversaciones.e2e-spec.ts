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

const AUTHOR_PHONE = '+573001112281';
const BUYER_PHONE = '+573001112282';
const ADMIN_EMAIL = 'ops-msg@example.com';
const ADMIN_PASSWORD = 'ClaveSegura1';

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

describe('Conversaciones (e2e)', () => {
  jest.setTimeout(30_000);
  let app: INestApplication<App>;
  let authorToken: string;
  let buyerToken: string;
  let adminToken: string;

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

    authorToken = await naturalToken(app, AUTHOR_PHONE);
    buyerToken = await naturalToken(app, BUYER_PHONE);

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

  it('opens a thread from a post, exchanges short texts, pages, and notifies', async () => {
    const post = await request(app.getHttpServer())
      .post('/posts')
      .set('Authorization', `Bearer ${authorToken}`)
      .send({
        title: 'Papa criolla',
        description: 'Cosecha de Siachoque',
        category: 'papa',
      })
      .expect(201);
    const postId = (post.body as { id: string }).id;

    await request(app.getHttpServer()).post('/conversaciones').expect(401);

    const self = await request(app.getHttpServer())
      .post('/conversaciones')
      .set('Authorization', `Bearer ${authorToken}`)
      .send({ postId })
      .expect(400);
    expect((self.body as { error: { code: string } }).error.code).toBe(
      ErrorCode.VALIDATION_ERROR,
    );

    const created = await request(app.getHttpServer())
      .post('/conversaciones')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ postId })
      .expect(201);
    const thread = created.body as {
      id: string;
      postId: string;
      initiatorId: string;
      peerId: string;
    };
    expect(thread.postId).toBe(postId);

    const replay = await request(app.getHttpServer())
      .post('/conversaciones')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ postId })
      .expect(200);
    expect((replay.body as { id: string }).id).toBe(thread.id);

    const offer = await request(app.getHttpServer())
      .post(`/conversaciones/${thread.id}/mensajes`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ body: '¿A 2500 el kilo, 20 bultos?' })
      .expect(201);
    expect((offer.body as { body: string }).body).toBe(
      '¿A 2500 el kilo, 20 bultos?',
    );

    await request(app.getHttpServer())
      .post(`/conversaciones/${thread.id}/mensajes`)
      .set('Authorization', `Bearer ${authorToken}`)
      .send({ body: 'Listo. Entrega en la plaza el martes.' })
      .expect(201);

    const page = await request(app.getHttpServer())
      .get(`/conversaciones/${thread.id}/mensajes`)
      .query({ limit: 1 })
      .set('Authorization', `Bearer ${authorToken}`)
      .expect(200);
    const pageBody = page.body as {
      items: { body: string }[];
      nextCursor: string | null;
    };
    expect(pageBody.items).toHaveLength(1);
    expect(pageBody.items[0]?.body).toBe(
      'Listo. Entrega en la plaza el martes.',
    );
    expect(pageBody.nextCursor).toBeTruthy();

    const older = await request(app.getHttpServer())
      .get(`/conversaciones/${thread.id}/mensajes`)
      .query({ limit: 10, cursor: pageBody.nextCursor })
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(200);
    const olderBody = older.body as { items: { body: string }[] };
    expect(olderBody.items[0]?.body).toBe('¿A 2500 el kilo, 20 bultos?');

    const inbox = await request(app.getHttpServer())
      .get('/notifications/pending')
      .set('Authorization', `Bearer ${authorToken}`)
      .expect(200);
    const items = (
      inbox.body as {
        items: { title: string; data: { conversationId?: string } }[];
      }
    ).items;
    expect(items.some((item) => item.data.conversationId === thread.id)).toBe(
      true,
    );
    expect(JSON.stringify(created.body)).not.toContain(AUTHOR_PHONE);
    expect(JSON.stringify(offer.body)).not.toContain(BUYER_PHONE);
  });

  it('rejects ADMIN and strangers', async () => {
    const post = await request(app.getHttpServer())
      .post('/posts')
      .set('Authorization', `Bearer ${authorToken}`)
      .send({
        title: 'Cebolla',
        description: 'Lote',
        category: 'cebolla',
      })
      .expect(201);
    const postId = (post.body as { id: string }).id;

    await request(app.getHttpServer())
      .post('/conversaciones')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ postId })
      .expect(403);

    const thread = await request(app.getHttpServer())
      .post('/conversaciones')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ postId })
      .expect(201);
    const id = (thread.body as { id: string }).id;

    const stranger = await naturalToken(app, '+573001112283');
    await request(app.getHttpServer())
      .get(`/conversaciones/${id}/mensajes`)
      .set('Authorization', `Bearer ${stranger}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/conversaciones/${id}/mensajes`)
      .set('Authorization', `Bearer ${stranger}`)
      .send({ body: 'intruso' })
      .expect(404);

    await request(app.getHttpServer())
      .get(`/conversaciones/${id}/mensajes`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/conversaciones/${id}/mensajes`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ body: 'admin' })
      .expect(403);
  });

  it('rejects a missing post and an oversized message', async () => {
    await request(app.getHttpServer())
      .post('/conversaciones')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ postId: '00000000-0000-4000-8000-000000000099' })
      .expect(404);

    const post = await request(app.getHttpServer())
      .post('/posts')
      .set('Authorization', `Bearer ${authorToken}`)
      .send({
        title: 'Maíz',
        description: 'Lote',
        category: 'maiz',
      })
      .expect(201);
    const thread = await request(app.getHttpServer())
      .post('/conversaciones')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ postId: (post.body as { id: string }).id })
      .expect(201);
    const id = (thread.body as { id: string }).id;

    const tooLong = await request(app.getHttpServer())
      .post(`/conversaciones/${id}/mensajes`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ body: 'x'.repeat(501) })
      .expect(400);
    expect((tooLong.body as { error: { code: string } }).error.code).toBe(
      ErrorCode.VALIDATION_ERROR,
    );

    const blank = await request(app.getHttpServer())
      .post(`/conversaciones/${id}/mensajes`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ body: '   ' })
      .expect(400);
    expect((blank.body as { error: { code: string } }).error.code).toBe(
      ErrorCode.VALIDATION_ERROR,
    );
  });
});
