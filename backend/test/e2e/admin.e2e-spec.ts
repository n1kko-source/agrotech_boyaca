import { generateKeyPairSync } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { VERIFICATION_AUDIT } from '../../src/admin/audit/verification-audit';
import { MemoryVerificationAudit } from '../../src/admin/audit/verification-audit.store';
import { AppModule } from '../../src/app.module';
import { FirebaseEmailClient } from '../../src/auth/email/firebase-email.client';
import { USERS_REPOSITORY } from '../../src/auth/users/users.repository';
import type { UsersRepository } from '../../src/auth/users/users.repository';
import { configureApp } from '../../src/shared/configure-app';

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

describe('Admin JURIDICA (e2e)', () => {
  let app: INestApplication<App>;
  let users: UsersRepository;
  let firebase: FirebaseEmailClient;
  let audit: MemoryVerificationAudit;

  const EMAIL = 'coop-admin@example.com';
  const PASSWORD = 'ClaveSegura1';
  const NIT = '800.197.268-4';
  const ADMIN_EMAIL = 'ops@example.com';
  const ADMIN_PASSWORD = 'AdminClave1';
  const PHONE = '+573001112244';

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
    audit = app.get(VERIFICATION_AUDIT);
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists pending and verifies with ADMIN JWT; NATURAL is forbidden', async () => {
    await request(app.getHttpServer())
      .get('/admin/juridica/pending')
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

    const pendingUser = await users.findJuridicaByEmail(EMAIL);
    if (!pendingUser) {
      throw new Error('expected pending juridica');
    }

    const otpSend = await request(app.getHttpServer())
      .post('/auth/otp/send')
      .send({ phone: PHONE })
      .expect(200);
    const otpBody = otpSend.body as { devCode: string };
    const natural = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({ phone: PHONE, code: otpBody.devCode, acceptPrivacyPolicy: true })
      .expect(200);
    const naturalTokens = natural.body as { accessToken: string };

    await request(app.getHttpServer())
      .get('/admin/juridica/pending')
      .set('Authorization', `Bearer ${naturalTokens.accessToken}`)
      .expect(403);

    const signed = await firebase.signUp(ADMIN_EMAIL, ADMIN_PASSWORD);
    await firebase.sendEmailVerification(signed.idToken);
    const adminUser = await users.createAdmin({
      email: ADMIN_EMAIL,
      firebaseUid: signed.localId,
    });

    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login/admin')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);
    const adminTokens = adminLogin.body as { accessToken: string };
    expect(adminTokens.accessToken.split('.').length).toBe(3);

    const pending = await request(app.getHttpServer())
      .get('/admin/juridica/pending')
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .expect(200);

    const pendingBody = pending.body as {
      items: Array<{
        id: string;
        entityType: string;
        nitMasked: string;
        createdAt: string;
      }>;
      nextCursor: string | null;
    };
    expect(pendingBody.items).toHaveLength(1);
    expect(pendingBody.items[0]?.id).toBe(pendingUser.id);
    expect(pendingBody.items[0]?.entityType).toBe('cooperativa');
    expect(pendingBody.items[0]?.nitMasked).toBe('****268-4');
    expect(JSON.stringify(pending.body)).not.toContain(EMAIL);
    expect(JSON.stringify(pending.body)).not.toContain('8001972684');

    await request(app.getHttpServer())
      .patch(`/admin/juridica/${pendingUser.id}/verify`)
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .send({ verified: true })
      .expect(200);

    expect(audit.events).toEqual([
      {
        actorId: adminUser.id,
        targetUserId: pendingUser.id,
        verified: true,
      },
    ]);

    const after = await request(app.getHttpServer())
      .get('/admin/juridica/pending')
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .expect(200);
    const afterBody = after.body as { items: unknown[] };
    expect(afterBody.items).toHaveLength(0);

    await request(app.getHttpServer())
      .post('/auth/login/juridica')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
  });
});
