import { generateKeyPairSync } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../../src/shared/auth/role.enum';
import { MemoryKvStore } from '../../src/shared/redis/memory-kv.store';
import {
  ACCESS_TTL_JURIDICA_SECONDS,
  ACCESS_TTL_NATURAL_SECONDS,
  REFRESH_TTL_JURIDICA_SECONDS,
  TokenService,
} from '../../src/auth/tokens/token.service';

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

describe('TokenService', () => {
  const jwt = new JwtService();
  const config = {
    get: (key: string) => (key === 'JWT_PRIVATE_KEY' ? privateKey : undefined),
  } as ConfigService;

  it('issues RS256 access JWT (15m) and stores hashed refresh in kv', async () => {
    const kv = new MemoryKvStore();
    const tokens = new TokenService(jwt, config, kv);
    const issued = await tokens.issue('user-1', Role.NATURAL);

    expect(issued.expiresIn).toBe(ACCESS_TTL_NATURAL_SECONDS);
    expect(issued.tokenType).toBe('Bearer');

    const payload = await jwt.verifyAsync<{ sub: string; role: Role }>(
      issued.accessToken,
      { algorithms: ['RS256'], publicKey },
    );
    expect(payload.sub).toBe('user-1');
    expect(payload.role).toBe(Role.NATURAL);

    const rotated = await tokens.rotate(issued.refreshToken);
    expect(rotated.accessToken).not.toBe(issued.accessToken);
    await expect(tokens.rotate(issued.refreshToken)).rejects.toThrow();
  });

  it('issues JURIDICA access JWT 60m and refresh TTL 30d', async () => {
    const kv = new MemoryKvStore();
    const set = jest.spyOn(kv, 'set');
    const tokens = new TokenService(jwt, config, kv);
    const issued = await tokens.issue('org-1', Role.JURIDICA);

    expect(issued.expiresIn).toBe(ACCESS_TTL_JURIDICA_SECONDS);
    const payload = await jwt.verifyAsync<{ sub: string; role: Role }>(
      issued.accessToken,
      { algorithms: ['RS256'], publicKey },
    );
    expect(payload.role).toBe(Role.JURIDICA);
    expect(set.mock.calls[0]?.[2]).toBe(REFRESH_TTL_JURIDICA_SECONDS);
  });
});
