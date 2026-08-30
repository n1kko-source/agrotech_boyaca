import { generateKeyPairSync } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { FCM_CLIENT } from '../../src/notifications/fcm/fcm.client';
import type {
  FcmClient,
  FcmSendResult,
} from '../../src/notifications/fcm/fcm.client';
import { NotificationService } from '../../src/notifications/notifications.service';
import { configureApp } from '../../src/shared/configure-app';
import { ErrorCode } from '../../src/shared/dto/api-error';

const PHONE = '+573001112299';
const FCM_TOKEN = 'fcm-test-token-android-01';
const DEVICE_ID = 'device-siachoque-1';

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

class RecordingFcm implements FcmClient {
  readonly sent: string[] = [];
  next: FcmSendResult = 'unavailable';

  send(message: { token: string }): Promise<FcmSendResult> {
    this.sent.push(message.token);
    return Promise.resolve(this.next);
  }
}

describe('Notifications FCM (e2e)', () => {
  let app: INestApplication<App>;
  let notifications: NotificationService;
  let fcm: RecordingFcm;
  let accessToken: string;
  let refreshToken: string;
  let userId: string;

  beforeAll(async () => {
    process.env.JWT_PRIVATE_KEY = privateKey;
    process.env.JWT_PUBLIC_KEY = publicKey;
    process.env.PII_HASH_PEPPER = 'e2e-pepper';
    process.env.PII_ENCRYPTION_KEY = 'e2e-enc-key';
    delete process.env.FIREBASE_WEB_API_KEY;
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;
    delete process.env.DATABASE_URL;
    delete process.env.REDIS_URL;

    fcm = new RecordingFcm();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(FCM_CLIENT)
      .useValue(fcm)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    notifications = app.get(NotificationService);

    await request(app.getHttpServer())
      .get('/notifications/pending')
      .expect(401);

    const send = await request(app.getHttpServer())
      .post('/auth/otp/send')
      .send({ phone: PHONE })
      .expect(200);
    const verify = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({
        phone: PHONE,
        code: (send.body as { devCode: string }).devCode,
        acceptPrivacyPolicy: true,
        fcmToken: FCM_TOKEN,
        deviceId: DEVICE_ID,
      })
      .expect(200);
    accessToken = (verify.body as { accessToken: string }).accessToken;
    refreshToken = (verify.body as { refreshToken: string }).refreshToken;
    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    userId = (me.body as { sub: string }).sub;

    await request(app.getHttpServer())
      .put('/notifications/devices')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fcmToken: FCM_TOKEN, deviceId: DEVICE_ID })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  it('queues while FCM is unreachable and delivers via inbox on reconnect', async () => {
    fcm.next = 'unavailable';
    const sent = await notifications.send(userId, {
      title: 'Precio papa',
      body: 'Siachoque 2800 COP/kg',
      data: { producto: 'papa criolla' },
    });
    expect(sent.status).toBe('pending');

    const pending = await request(app.getHttpServer())
      .get('/notifications/pending')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const pendingBody = pending.body as {
      items: Array<{ id: string; title: string }>;
    };
    expect(pendingBody.items.some((item) => item.id === sent.id)).toBe(true);
    expect(pendingBody.items.find((item) => item.id === sent.id)?.title).toBe(
      'Precio papa',
    );
    expect(JSON.stringify(pending.body)).not.toContain(FCM_TOKEN);

    const ack = await request(app.getHttpServer())
      .post('/notifications/pending/ack')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ids: [sent.id] })
      .expect(200);
    expect((ack.body as { acked: number }).acked).toBe(1);

    const empty = await request(app.getHttpServer())
      .get('/notifications/pending')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      (empty.body as { items: Array<{ id: string }> }).items.some(
        (item) => item.id === sent.id,
      ),
    ).toBe(false);
  });

  it('PUT /notifications/devices upserts the token and flushes the inbox via FCM', async () => {
    fcm.next = 'unavailable';
    await notifications.send(userId, {
      title: 'Helada',
      body: 'Alerta de temperatura',
    });

    fcm.next = 'ok';
    await request(app.getHttpServer())
      .put('/notifications/devices')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fcmToken: `${FCM_TOKEN}-b`, deviceId: `${DEVICE_ID}-b` })
      .expect(200);

    expect(fcm.sent).toContain(`${FCM_TOKEN}-b`);
    const pending = await request(app.getHttpServer())
      .get('/notifications/pending')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const pendingItems = (pending.body as { items: Array<{ id: string }> })
      .items;
    expect(pendingItems.length).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .post('/notifications/pending/ack')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ids: pendingItems.map((item) => item.id) })
      .expect(200);
  });

  it('cleans unregistered tokens and rejects a device without JWT', async () => {
    await request(app.getHttpServer())
      .put('/notifications/devices')
      .send({ fcmToken: FCM_TOKEN, deviceId: DEVICE_ID })
      .expect(401);

    fcm.next = 'ok';
    await request(app.getHttpServer())
      .put('/notifications/devices')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fcmToken: 'token-to-be-unregistered', deviceId: 'device-stale' })
      .expect(200);

    fcm.next = 'unregistered';
    const result = await notifications.send(userId, {
      title: 'Limpieza',
      body: 'Token muerto',
    });
    expect(result.status).toBe('pending');

    await request(app.getHttpServer())
      .delete('/notifications/devices')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ deviceId: 'device-stale' })
      .expect(200);

    const missing = await request(app.getHttpServer())
      .put('/notifications/devices')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fcmToken: 'short', deviceId: DEVICE_ID })
      .expect(400);
    expect((missing.body as { error: { code: string } }).error.code).toBe(
      ErrorCode.VALIDATION_ERROR,
    );
  });

  it('POST /auth/logout accepts optional deviceId without failing the session revoke', async () => {
    const logoutDevice = 'device-logout-ok';
    await request(app.getHttpServer())
      .put('/notifications/devices')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fcmToken: `${FCM_TOKEN}-logout`, deviceId: logoutDevice })
      .expect(200);

    const tooShort = await request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken, deviceId: 'short' })
      .expect(400);
    expect((tooShort.body as { error: { code: string } }).error.code).toBe(
      ErrorCode.VALIDATION_ERROR,
    );

    await request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken, deviceId: logoutDevice })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(401);

    await request(app.getHttpServer())
      .get('/notifications/pending')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .delete('/notifications/devices')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ deviceId: logoutDevice })
      .expect(200);
  });
});
