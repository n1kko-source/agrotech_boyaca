import { generateKeyPairSync } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/shared/configure-app';
import { ErrorCode } from '../../src/shared/dto/api-error';

const PHONE = '+573001112277';

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

async function naturalToken(app: INestApplication<App>): Promise<string> {
  const send = await request(app.getHttpServer())
    .post('/auth/otp/send')
    .send({ phone: PHONE })
    .expect(200);
  const sendBody = send.body as { devCode?: string };
  const verify = await request(app.getHttpServer())
    .post('/auth/otp/verify')
    .send({
      phone: PHONE,
      code: sendBody.devCode,
      acceptPrivacyPolicy: true,
    })
    .expect(200);
  return (verify.body as { accessToken: string }).accessToken;
}

describe('Posts and profiles search (e2e)', () => {
  let app: INestApplication<App>;
  let token: string;

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
    token = await naturalToken(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects search without JWT and without q', async () => {
    await request(app.getHttpServer()).get('/posts/search').expect(401);
    await request(app.getHttpServer())
      .get('/posts/search')
      .query({ q: 'papa' })
      .expect(401);

    const missing = await request(app.getHttpServer())
      .get('/posts/search')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    const body = missing.body as { error: { code: string } };
    expect(body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it('creates a post, ranks it, and tolerates unaccent plus a typo', async () => {
    const created = await request(app.getHttpServer())
      .post('/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Venta de papa criolla',
        description: 'Cosecha de Siachoque, bultos de 50 kg',
        category: 'papa',
      })
      .expect(201);
    const post = created.body as { id: string; title: string };
    expect(post.title).toBe('Venta de papa criolla');

    await request(app.getHttpServer())
      .post('/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Cebolla cabezona',
        description: 'Roja y blanca',
        category: 'cebolla',
      })
      .expect(201);

    const accent = await request(app.getHttpServer())
      .get('/posts/search')
      .query({ q: 'papá criolla' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const accentBody = accent.body as {
      items: Array<{ id: string; title: string; rank: number }>;
    };
    expect(accentBody.items[0]?.id).toBe(post.id);

    const typo = await request(app.getHttpServer())
      .get('/posts/search')
      .query({ q: 'ceblla' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const typoBody = typo.body as { items: Array<{ title: string }> };
    expect(typoBody.items[0]?.title).toBe('Cebolla cabezona');
  });

  it('upserts a public profile and searches producers by municipality', async () => {
    await request(app.getHttpServer())
      .put('/profiles/me')
      .set('Authorization', `Bearer ${token}`)
      .send({
        displayName: 'Finca El Rosal',
        municipality: 'Siachoque',
        category: 'papa',
        bio: 'Papa pastusa',
      })
      .expect(200);

    const page = await request(app.getHttpServer())
      .get('/profiles/search')
      .query({ q: 'Siachoqe' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const body = page.body as {
      items: Array<{ displayName: string; municipality: string }>;
    };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.displayName).toBe('Finca El Rosal');
    expect(JSON.stringify(body)).not.toContain(PHONE);
  });
});
