import { generateKeyPairSync } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { FirebaseEmailClient } from '../../src/auth/email/firebase-email.client';
import { USERS_REPOSITORY } from '../../src/auth/users/users.repository';
import type { UsersRepository } from '../../src/auth/users/users.repository';
import {
  PRIVACY_POLICY_ACCEPT_LABEL,
  PRIVACY_POLICY_VERSION,
} from '../../src/legal/privacy-policy';
import { configureApp } from '../../src/shared/configure-app';
import { ErrorCode } from '../../src/shared/dto/api-error';

const PHONE = '+573001112255';
const EMAIL = 'habeas@example.com';
const PASSWORD = 'ClaveSegura1';
const NIT = '800.197.268-4';
const ADMIN_EMAIL = 'ops-privacy@example.com';
const ADMIN_PASSWORD = 'AdminClave1';

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

describe('Ley 1581 consent and habeas data (e2e)', () => {
  let app: INestApplication<App>;
  let users: UsersRepository;
  let firebase: FirebaseEmailClient;

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
    users = app.get(USERS_REPOSITORY);
    firebase = app.get(FirebaseEmailClient);
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the privacy policy as JSON and markdown', async () => {
    const json = await request(app.getHttpServer())
      .get('/legal/privacy-policy')
      .expect(200);
    const body = json.body as {
      version: string;
      title: string;
      acceptLabel: string;
      markdown: string;
    };
    expect(body.version).toBe(PRIVACY_POLICY_VERSION);
    expect(body.acceptLabel).toBe(PRIVACY_POLICY_ACCEPT_LABEL);
    expect(body.markdown).toContain('Ley 1581');
    expect(body.markdown).toContain('habeas data');

    const md = await request(app.getHttpServer())
      .get('/legal/privacy-policy.md')
      .expect(200);
    expect(md.headers['content-type']).toMatch(/markdown/);
    expect(md.text).toContain('Ley 1581');
  });

  it('rejects NATURAL verify and JURIDICA register without consent', async () => {
    const missing = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({ phone: PHONE, code: '123456' })
      .expect(400);
    expect((missing.body as { error: { code: string } }).error.code).toBe(
      ErrorCode.VALIDATION_ERROR,
    );

    const denied = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({
        phone: PHONE,
        code: '123456',
        acceptPrivacyPolicy: false,
      })
      .expect(400);
    expect((denied.body as { error: { code: string } }).error.code).toBe(
      ErrorCode.VALIDATION_ERROR,
    );

    const juridica = await request(app.getHttpServer())
      .post('/auth/register/juridica')
      .send({
        email: EMAIL,
        password: PASSWORD,
        nit: NIT,
        entityType: 'cooperativa',
      })
      .expect(400);
    expect((juridica.body as { error: { code: string } }).error.code).toBe(
      ErrorCode.VALIDATION_ERROR,
    );
  });

  it('persists policy version on NATURAL verify and records a deletion request', async () => {
    const send = await request(app.getHttpServer())
      .post('/auth/otp/send')
      .send({ phone: PHONE })
      .expect(200);
    const sendBody = send.body as { devCode: string };

    const verify = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({
        phone: PHONE,
        code: sendBody.devCode,
        acceptPrivacyPolicy: true,
      })
      .expect(200);
    const tokens = verify.body as {
      accessToken: string;
      refreshToken: string;
    };

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(200);
    const meBody = me.body as { sub: string };
    const consent = await users.findPrivacyConsent(meBody.sub);
    expect(consent?.version).toBe(PRIVACY_POLICY_VERSION);
    expect(consent?.acceptedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    await request(app.getHttpServer())
      .post('/auth/privacy/deletion-request')
      .expect(401);

    const deletion = await request(app.getHttpServer())
      .post('/auth/privacy/deletion-request')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(200);
    expect(deletion.body).toEqual({ requested: true });

    await request(app.getHttpServer())
      .post('/auth/privacy/deletion-request')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(200);

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
    const adminTokens = adminLogin.body as { accessToken: string };

    const listed = await request(app.getHttpServer())
      .get('/admin/privacy/deletion-requests')
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .expect(200);
    const listBody = listed.body as {
      items: Array<{ id: string; userId: string; createdAt: string }>;
      nextCursor: string | null;
    };
    expect(listBody.items).toHaveLength(1);
    expect(listBody.items[0]?.userId).toBe(meBody.sub);
    expect(JSON.stringify(listed.body)).not.toContain(PHONE);
  });
});
