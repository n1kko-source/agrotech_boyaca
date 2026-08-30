import { generateKeyPairSync } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { WEATHER_CLIENT } from '../../src/clima/openweather/weather.client';
import type {
  WeatherClient,
  WeatherFetchResult,
  WeatherSnapshot,
} from '../../src/clima/openweather/weather.client';
import { NotificationService } from '../../src/notifications/notifications.service';
import { configureApp } from '../../src/shared/configure-app';
import { ErrorCode } from '../../src/shared/dto/api-error';

const PHONE = '+573001112277';
const JOB_SECRET = 'e2e-clima-job-secret';

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const rain: WeatherSnapshot = {
  municipio: 'siachoque',
  current: {
    at: '2026-08-30T12:00:00.000Z',
    tempC: 11,
    weatherId: 500,
    weather: 'Rain',
    description: 'lluvia ligera',
    pop: 0.7,
    rainMm: 2,
  },
  forecast: [],
  fetchedAt: '2026-08-30T12:00:00.000Z',
};

class StubWeather implements WeatherClient {
  calls = 0;
  next: WeatherFetchResult = { ok: true, snapshot: rain };

  fetch(): Promise<WeatherFetchResult> {
    this.calls += 1;
    return Promise.resolve(this.next);
  }
}

describe('Clima and alertas (e2e)', () => {
  let app: INestApplication<App>;
  let weather: StubWeather;
  let send: jest.SpyInstance;
  let accessToken: string;

  beforeAll(async () => {
    process.env.JWT_PRIVATE_KEY = privateKey;
    process.env.JWT_PUBLIC_KEY = publicKey;
    process.env.PII_HASH_PEPPER = 'e2e-pepper';
    process.env.PII_ENCRYPTION_KEY = 'e2e-enc-key';
    process.env.CLIMA_JOB_SECRET = JOB_SECRET;
    delete process.env.FIREBASE_WEB_API_KEY;
    delete process.env.OPENWEATHER_API_KEY;
    delete process.env.DATABASE_URL;
    delete process.env.REDIS_URL;

    weather = new StubWeather();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(WEATHER_CLIENT)
      .useValue(weather)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    send = jest.spyOn(app.get(NotificationService), 'send');

    const otp = await request(app.getHttpServer())
      .post('/auth/otp/send')
      .send({ phone: PHONE })
      .expect(200);
    const verify = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({
        phone: PHONE,
        code: (otp.body as { devCode: string }).devCode,
        acceptPrivacyPolicy: true,
      })
      .expect(200);
    accessToken = (verify.body as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /clima/:municipio requires JWT and caches the OpenWeather snapshot', async () => {
    await request(app.getHttpServer()).get('/clima/siachoque').expect(401);

    const first = await request(app.getHttpServer())
      .get('/clima/Siachoque')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const body = first.body as { municipio: string; cached: boolean };
    expect(body.municipio).toBe('siachoque');
    expect(body.cached).toBe(false);
    expect(weather.calls).toBe(1);

    const second = await request(app.getHttpServer())
      .get('/clima/siachoque')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect((second.body as { cached: boolean }).cached).toBe(true);
    expect(weather.calls).toBe(1);
  });

  it('POST /alertas configures a threshold and the job fires NotificationService', async () => {
    await request(app.getHttpServer())
      .post('/alertas')
      .send({ municipio: 'siachoque', kind: 'rain' })
      .expect(401);

    const created = await request(app.getHttpServer())
      .post('/alertas')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ municipio: 'Siachoque', kind: 'rain' })
      .expect(200);
    expect(created.body).toMatchObject({
      municipio: 'siachoque',
      kind: 'rain',
      enabled: true,
    });

    const listed = await request(app.getHttpServer())
      .get('/alertas')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect((listed.body as { items: unknown[] }).items).toHaveLength(1);

    await request(app.getHttpServer()).post('/clima/jobs/evaluate').expect(401);

    const job = await request(app.getHttpServer())
      .post('/clima/jobs/evaluate')
      .set('x-clima-job-secret', JOB_SECRET)
      .expect(200);
    expect(job.body).toEqual({ evaluated: 1, fired: 1 });
    expect(send).toHaveBeenCalled();

    const badKind = await request(app.getHttpServer())
      .post('/alertas')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ municipio: 'siachoque', kind: 'hail' })
      .expect(400);
    expect((badKind.body as { error: { code: string } }).error.code).toBe(
      ErrorCode.VALIDATION_ERROR,
    );
  });
});
