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

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const PDF = Buffer.from('%PDF-1.4\n' + 'Guia tecnica papa '.repeat(20));

describe('Guias (e2e)', () => {
  let app: INestApplication<App>;
  let users: UsersRepository;
  let firebase: FirebaseEmailClient;
  let adminToken: string;
  let naturalToken: string;

  beforeAll(async () => {
    process.env.JWT_PRIVATE_KEY = privateKey;
    process.env.JWT_PUBLIC_KEY = publicKey;
    process.env.PII_HASH_PEPPER = 'e2e-pepper';
    process.env.PII_ENCRYPTION_KEY = 'e2e-enc-key';
    delete process.env.FIREBASE_WEB_API_KEY;
    delete process.env.DATABASE_URL;
    delete process.env.REDIS_URL;
    delete process.env.R2_ENDPOINT;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_BUCKET;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    users = app.get(USERS_REPOSITORY);
    firebase = app.get(FirebaseEmailClient);

    const otp = await request(app.getHttpServer())
      .post('/auth/otp/send')
      .send({ phone: '+573001112288' })
      .expect(200);
    const natural = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({
        phone: '+573001112288',
        code: (otp.body as { devCode: string }).devCode,
        acceptPrivacyPolicy: true,
      })
      .expect(200);
    naturalToken = (natural.body as { accessToken: string }).accessToken;

    const signed = await firebase.signUp(
      'ops-guias@example.com',
      'AdminClave1',
    );
    await firebase.sendEmailVerification(signed.idToken);
    await users.createAdmin({
      email: 'ops-guias@example.com',
      firebaseUid: signed.localId,
    });
    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login/admin')
      .send({ email: 'ops-guias@example.com', password: 'AdminClave1' })
      .expect(200);
    adminToken = (adminLogin.body as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('CRUD + cursor list + Range download; NATURAL cannot upload', async () => {
    await request(app.getHttpServer()).get('/guias').expect(401);

    await request(app.getHttpServer())
      .post('/guias')
      .set('Authorization', `Bearer ${naturalToken}`)
      .attach('archivo', PDF, {
        filename: 'papa.pdf',
        contentType: 'application/pdf',
      })
      .field('titulo', 'Siembra de papa')
      .field('categoria', 'Papa')
      .field('subsector', 'Tuberculos')
      .expect(403);

    const created = await request(app.getHttpServer())
      .post('/guias')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('archivo', PDF, {
        filename: 'papa.pdf',
        contentType: 'application/pdf',
      })
      .field('titulo', 'Siembra de papa')
      .field('categoria', 'Papa')
      .field('subsector', 'Tuberculos')
      .expect(201);

    const body = created.body as {
      id: string;
      titulo: string;
      categoria: string;
      kind: string;
      sizeBytes: number;
    };
    expect(body.titulo).toBe('Siembra de papa');
    expect(body.categoria).toBe('papa');
    expect(body.kind).toBe('pdf');
    expect(body.sizeBytes).toBe(PDF.length);

    const listed = await request(app.getHttpServer())
      .get('/guias')
      .query({ categoria: 'papa', limit: 20 })
      .set('Authorization', `Bearer ${naturalToken}`)
      .expect(200);
    const page = listed.body as {
      items: Array<{ id: string }>;
      nextCursor: string | null;
    };
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.id).toBe(body.id);
    expect(page.nextCursor).toBeNull();

    const full = await request(app.getHttpServer())
      .get(`/guias/${body.id}/archivo`)
      .set('Authorization', `Bearer ${naturalToken}`)
      .buffer()
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(full.headers['accept-ranges']).toBe('bytes');
    expect(Buffer.isBuffer(full.body) && full.body.equals(PDF)).toBe(true);

    const partial = await request(app.getHttpServer())
      .get(`/guias/${body.id}/archivo`)
      .set('Authorization', `Bearer ${naturalToken}`)
      .set('Range', 'bytes=0-4')
      .buffer()
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(206);
    expect(partial.headers['content-range']).toBe(`bytes 0-4/${PDF.length}`);
    expect(Buffer.isBuffer(partial.body) && partial.body.toString()).toBe(
      '%PDF-',
    );

    const health = await request(app.getHttpServer())
      .get('/health')
      .expect(200);
    const healthBody = health.body as {
      r2: { storageBytes: number; storageLimit: number; reads: number };
    };
    expect(healthBody.r2.storageBytes).toBe(PDF.length);
    expect(healthBody.r2.storageLimit).toBe(10 * 1024 * 1024 * 1024);
    expect(healthBody.r2.reads).toBeGreaterThanOrEqual(2);

    await request(app.getHttpServer())
      .patch(`/guias/${body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ titulo: 'Siembra de papa criolla' })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/guias/${body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/guias/${body.id}`)
      .set('Authorization', `Bearer ${naturalToken}`)
      .expect(404);
  });
});
