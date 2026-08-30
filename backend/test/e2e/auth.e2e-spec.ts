import { generateKeyPairSync } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { USERS_REPOSITORY } from '../../src/auth/users/users.repository';
import type { UsersRepository } from '../../src/auth/users/users.repository';
import { configureApp } from '../../src/shared/configure-app';
import { ErrorCode } from '../../src/shared/dto/api-error';

const PHONE = '+573001112233';

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

describe('Auth OTP NATURAL (e2e)', () => {
  let app: INestApplication<App>;

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /auth/otp/send rejects invalid phone without echoing it', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/otp/send')
      .send({ phone: '+15551234567' })
      .expect(400);

    const body = res.body as { error: { code: string; message: string } };
    expect(body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(JSON.stringify(res.body)).not.toContain('15551234567');
  });

  it('send → verify issues RS256 JWT 15m + refresh; reuse fails', async () => {
    const send = await request(app.getHttpServer())
      .post('/auth/otp/send')
      .send({ phone: PHONE })
      .expect(200);

    const sendBody = send.body as { sent: boolean; devCode?: string };
    expect(sendBody.sent).toBe(true);
    expect(sendBody.devCode).toMatch(/^\d{6}$/);

    const verify = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({ phone: PHONE, code: sendBody.devCode, acceptPrivacyPolicy: true })
      .expect(200);

    const tokens = verify.body as {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      tokenType: string;
    };
    expect(tokens.tokenType).toBe('Bearer');
    expect(tokens.expiresIn).toBe(900);
    expect(tokens.accessToken.split('.').length).toBe(3);
    expect(JSON.stringify(verify.body)).not.toContain(PHONE);

    await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({
        phone: PHONE,
        code: sendBody.devCode,
        acceptPrivacyPolicy: true,
      })
      .expect(401);

    const refresh = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(200);

    const rotated = refresh.body as {
      accessToken: string;
      refreshToken: string;
    };
    expect(rotated.refreshToken).not.toBe(tokens.refreshToken);

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${rotated.accessToken}`)
      .expect(200);
    const meBody = me.body as { role: string; entityType?: string };
    expect(meBody.role).toBe('NATURAL');
    expect(meBody.entityType).toBeUndefined();

    await request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken: rotated.refreshToken })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: rotated.refreshToken })
      .expect(401);
  });
});

describe('Auth JURIDICA (e2e)', () => {
  let app: INestApplication<App>;
  let users: UsersRepository;

  const EMAIL = 'coop@example.com';
  const PASSWORD = 'ClaveSegura1';
  const NIT = '800.197.268-4';

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /auth/register/juridica rejects invalid NIT without echoing it', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register/juridica')
      .send({
        email: EMAIL,
        password: PASSWORD,
        nit: '800197268-5',
        entityType: 'cooperativa',
        acceptPrivacyPolicy: true,
      })
      .expect(400);

    const body = res.body as { error: { code: string } };
    expect(body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(JSON.stringify(res.body)).not.toContain('800197268');
    expect(JSON.stringify(res.body)).not.toContain(PASSWORD);
  });

  it('register → login 403 until admin verifies → JWT 60m + refresh 30d', async () => {
    const register = await request(app.getHttpServer())
      .post('/auth/register/juridica')
      .send({
        email: EMAIL,
        password: PASSWORD,
        nit: NIT,
        entity_type: 'cooperativa',
        acceptPrivacyPolicy: true,
      })
      .expect(201);

    expect(register.body).toEqual({ registered: true });
    expect(JSON.stringify(register.body)).not.toContain(EMAIL);

    await request(app.getHttpServer())
      .post('/auth/login/juridica')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(403);

    const pending = await users.findJuridicaByEmail(EMAIL);
    expect(pending?.verified).toBe(false);
    expect(pending?.id).toBeDefined();
    if (!pending) {
      throw new Error('expected registered juridica user');
    }
    await users.setVerified(pending.id, true);

    const login = await request(app.getHttpServer())
      .post('/auth/login/juridica')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);

    const tokens = login.body as {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      tokenType: string;
    };
    expect(tokens.tokenType).toBe('Bearer');
    expect(tokens.expiresIn).toBe(3600);
    expect(tokens.accessToken.split('.').length).toBe(3);
    expect(JSON.stringify(login.body)).not.toContain(EMAIL);
    expect(JSON.stringify(login.body)).not.toContain(PASSWORD);

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(200);
    const meBody = me.body as { role: string; entityType?: string };
    expect(meBody.role).toBe('JURIDICA');
    expect(meBody.entityType).toBe('cooperativa');

    const loginAgain = await request(app.getHttpServer())
      .post('/auth/login/juridica')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
    const nextTokens = loginAgain.body as { refreshToken: string };

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(401);

    const resend = await request(app.getHttpServer())
      .post('/auth/register/juridica/resend')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
    expect(resend.body).toEqual({ sent: true });

    const refreshOk = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: nextTokens.refreshToken })
      .expect(200);
    const rotated = refreshOk.body as { refreshToken: string };

    await users.setVerified(pending.id, false);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: rotated.refreshToken })
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
      .expect(409);
  });
});
