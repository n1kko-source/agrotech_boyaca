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

const AUTHOR_PHONE = '+573001112310';
const VIEWER_PHONE = '+573001112311';
const ADMIN_EMAIL = 'ops-posts-crud@example.com';
const ADMIN_PASSWORD = 'AdminClave1';

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
  const verify = await request(app.getHttpServer())
    .post('/auth/otp/verify')
    .send({
      phone,
      code: (send.body as { devCode?: string }).devCode,
      acceptPrivacyPolicy: true,
    })
    .expect(200);
  return (verify.body as { accessToken: string }).accessToken;
}

describe('Posts CRUD (e2e AG-20)', () => {
  jest.setTimeout(30_000);
  let app: INestApplication<App>;
  let authorToken: string;
  let viewerToken: string;
  let adminToken: string;
  let authorId: string;
  let postId: string;

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
    viewerToken = await naturalToken(app, VIEWER_PHONE);

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${authorToken}`)
      .expect(200);
    authorId = (me.body as { sub: string }).sub;

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

    const created = await request(app.getHttpServer())
      .post('/posts')
      .set('Authorization', `Bearer ${authorToken}`)
      .send({
        title: 'Papa criolla de Siachoque',
        description: 'Bultos de 50 kg',
        category: 'papa',
      })
      .expect(201);
    postId = (created.body as { id: string }).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects GET without JWT and a malformed id', async () => {
    await request(app.getHttpServer()).get(`/posts/${postId}`).expect(401);

    const malformed = await request(app.getHttpServer())
      .get('/posts/not-a-uuid')
      .set('Authorization', `Bearer ${authorToken}`)
      .expect(400);
    expect((malformed.body as { error: { code: string } }).error.code).toBe(
      ErrorCode.VALIDATION_ERROR,
    );
  });

  it('lets the owner GET an unlisted post and hides it from others', async () => {
    const mine = await request(app.getHttpServer())
      .get(`/posts/${postId}`)
      .set('Authorization', `Bearer ${authorToken}`)
      .expect(200);
    const body = mine.body as {
      id: string;
      authorId: string;
      title: string;
      description: string;
      category: string;
      createdAt: string;
    };
    expect(body).toEqual({
      id: postId,
      authorId,
      title: 'Papa criolla de Siachoque',
      description: 'Bultos de 50 kg',
      category: 'papa',
      createdAt: body.createdAt,
    });
    expect(JSON.stringify(body)).not.toContain('en_gracia');

    await request(app.getHttpServer())
      .get(`/posts/${postId}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/posts/${postId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('lists GET to others after admin payment without exposing grace', async () => {
    await request(app.getHttpServer())
      .post(`/admin/suscripciones/${authorId}/pagos`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ channel: 'transferencia', reference: 'POSTS-CRUD-E2E' })
      .expect(200);

    const listed = await request(app.getHttpServer())
      .get(`/posts/${postId}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);
    const body = listed.body as { id: string; title: string };
    expect(body.id).toBe(postId);
    expect(body.title).toBe('Papa criolla de Siachoque');
    expect(JSON.stringify(listed.body)).not.toContain('en_gracia');

    await request(app.getHttpServer())
      .get(`/posts/${postId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const feed = await request(app.getHttpServer())
      .get('/posts')
      .query({ limit: 20 })
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);
    const page = feed.body as { items: { id: string }[]; nextCursor: string | null };
    expect(page.items.some((item) => item.id === postId)).toBe(true);
    expect(JSON.stringify(feed.body)).not.toContain('en_gracia');
  });

  it('PATCHes own fields, hides a stranger, and forbids ADMIN', async () => {
    const updated = await request(app.getHttpServer())
      .patch(`/posts/${postId}`)
      .set('Authorization', `Bearer ${authorToken}`)
      .send({
        title: 'Papa pastusa de Siachoque',
        description: 'Bultos de 60 kg',
        category: 'papa pastusa',
      })
      .expect(200);
    expect(updated.body).toMatchObject({
      id: postId,
      title: 'Papa pastusa de Siachoque',
      description: 'Bultos de 60 kg',
      category: 'papa pastusa',
    });

    await request(app.getHttpServer())
      .patch(`/posts/${postId}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({
        title: 'No es mio',
        description: 'Intento ajeno',
        category: 'papa',
      })
      .expect(404);

    const missing = await request(app.getHttpServer())
      .patch(`/posts/${randomUUID()}`)
      .set('Authorization', `Bearer ${authorToken}`)
      .send({
        title: 'No existe',
        description: 'Fantasma',
        category: 'papa',
      })
      .expect(404);
    expect((missing.body as { error: { code: string } }).error.code).toBe(
      ErrorCode.NOT_FOUND,
    );

    const forbidden = await request(app.getHttpServer())
      .patch(`/posts/${postId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Admin no edita',
        description: 'Forbidden',
        category: 'papa',
      })
      .expect(403);
    expect((forbidden.body as { error: { code: string } }).error.code).toBe(
      ErrorCode.FORBIDDEN,
    );
  });

  it('DELETEs own post with 204 and hides strangers and ADMIN', async () => {
    await request(app.getHttpServer())
      .delete(`/posts/${postId}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(404);

    const forbidden = await request(app.getHttpServer())
      .delete(`/posts/${postId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
    expect((forbidden.body as { error: { code: string } }).error.code).toBe(
      ErrorCode.FORBIDDEN,
    );

    await request(app.getHttpServer())
      .delete(`/posts/${postId}`)
      .set('Authorization', `Bearer ${authorToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/posts/${postId}`)
      .set('Authorization', `Bearer ${authorToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/posts/${randomUUID()}`)
      .set('Authorization', `Bearer ${authorToken}`)
      .expect(404);
  });
});
