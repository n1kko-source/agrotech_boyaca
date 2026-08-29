import { generateKeyPairSync } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
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
      .send({ phone: PHONE, code: sendBody.devCode })
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
      .send({ phone: PHONE, code: sendBody.devCode })
      .expect(401);

    const refresh = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(200);

    const rotated = refresh.body as { accessToken: string };
    expect(rotated.accessToken).not.toBe(tokens.accessToken);
  });
});
