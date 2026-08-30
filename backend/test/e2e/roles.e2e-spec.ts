import { generateKeyPairSync } from 'node:crypto';
import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { USERS_REPOSITORY } from '../../src/auth/users/users.repository';
import type { UsersRepository } from '../../src/auth/users/users.repository';
import type { JwtUser } from '../../src/shared/auth/jwt-user';
import { Role } from '../../src/shared/auth/role.enum';
import { configureApp } from '../../src/shared/configure-app';
import { CurrentUser } from '../../src/shared/decorators/current-user.decorator';
import { Roles } from '../../src/shared/decorators/roles.decorator';

@Controller('roles-fixture')
class RolesFixtureController {
  @Get('natural')
  @Roles(Role.NATURAL)
  natural(): { ok: true } {
    return { ok: true };
  }

  @Get('juridica')
  @Roles(Role.JURIDICA)
  juridica(@CurrentUser() user: JwtUser): JwtUser {
    return user;
  }
}

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

describe('Roles decorator and entityType (e2e)', () => {
  let app: INestApplication<App>;
  let users: UsersRepository;

  const PHONE = '+573001112266';
  const EMAIL = 'empresa@example.com';
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
      controllers: [RolesFixtureController],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    users = app.get(USERS_REPOSITORY);
  });

  afterAll(async () => {
    await app.close();
  });

  it('@Roles NATURAL | JURIDICA; empresa is entityType on the JURIDICA profile', async () => {
    const otpSend = await request(app.getHttpServer())
      .post('/auth/otp/send')
      .send({ phone: PHONE })
      .expect(200);
    const otpBody = otpSend.body as { devCode: string };
    const natural = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({ phone: PHONE, code: otpBody.devCode })
      .expect(200);
    const naturalTokens = natural.body as {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    };
    expect(naturalTokens.expiresIn).toBe(900);

    await request(app.getHttpServer())
      .get('/roles-fixture/natural')
      .set('Authorization', `Bearer ${naturalTokens.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/roles-fixture/juridica')
      .set('Authorization', `Bearer ${naturalTokens.accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .post('/auth/register/juridica')
      .send({
        email: EMAIL,
        password: PASSWORD,
        nit: NIT,
        entityType: 'empresa',
      })
      .expect(201);

    const pending = await users.findJuridicaByEmail(EMAIL);
    if (!pending) {
      throw new Error('expected registered juridica user');
    }
    await users.setVerified(pending.id, true);

    const login = await request(app.getHttpServer())
      .post('/auth/login/juridica')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
    const juridicaTokens = login.body as {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    };
    expect(juridicaTokens.expiresIn).toBe(3600);

    const payload = decodeJwt(juridicaTokens.accessToken);
    expect(payload.role).toBe('JURIDICA');
    expect(payload.entityType).toBe('empresa');
    expect(payload.role).not.toBe('empresa');

    const juridicaRoute = await request(app.getHttpServer())
      .get('/roles-fixture/juridica')
      .set('Authorization', `Bearer ${juridicaTokens.accessToken}`)
      .expect(200);
    expect(juridicaRoute.body).toEqual({
      sub: pending.id,
      role: 'JURIDICA',
      entityType: 'empresa',
    });

    await request(app.getHttpServer())
      .get('/roles-fixture/natural')
      .set('Authorization', `Bearer ${juridicaTokens.accessToken}`)
      .expect(403);

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${juridicaTokens.accessToken}`)
      .expect(200);
    expect(me.body).toEqual({
      sub: pending.id,
      role: 'JURIDICA',
      entityType: 'empresa',
    });

    const naturalRefresh = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: naturalTokens.refreshToken })
      .expect(200);
    const naturalRotated = naturalRefresh.body as { refreshToken: string };

    const juridicaRefresh = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: juridicaTokens.refreshToken })
      .expect(200);
    const juridicaRotated = juridicaRefresh.body as {
      accessToken: string;
      refreshToken: string;
    };
    const refreshedMe = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${juridicaRotated.accessToken}`)
      .expect(200);
    expect(refreshedMe.body).toMatchObject({
      role: 'JURIDICA',
      entityType: 'empresa',
    });

    await request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken: naturalRotated.refreshToken })
      .expect(200);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: naturalRotated.refreshToken })
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken: juridicaRotated.refreshToken })
      .expect(200);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: juridicaRotated.refreshToken })
      .expect(401);
  });
});

function decodeJwt(token: string): {
  role?: string;
  entityType?: string;
} {
  const part = token.split('.')[1];
  if (!part) {
    throw new Error('invalid jwt');
  }
  return JSON.parse(Buffer.from(part, 'base64url').toString()) as {
    role?: string;
    entityType?: string;
  };
}
