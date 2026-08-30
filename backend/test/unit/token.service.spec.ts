import { generateKeyPairSync } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../../src/shared/auth/role.enum';
import { MemoryKvStore } from '../../src/shared/redis/memory-kv.store';
import {
  ACCESS_TTL_JURIDICA_SECONDS,
  ACCESS_TTL_NATURAL_SECONDS,
  REFRESH_TTL_JURIDICA_SECONDS,
  REFRESH_TTL_NATURAL_SECONDS,
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

  async function reissue(
    tokens: TokenService,
    refreshToken: string,
  ): Promise<Awaited<ReturnType<TokenService['issue']>>> {
    const payload = await tokens.takeRefresh(refreshToken);
    return tokens.issue(payload.sub, payload.role, payload.entityType);
  }

  it('issues RS256 access JWT (15m) and stores hashed refresh in kv', async () => {
    const kv = new MemoryKvStore();
    const set = jest.spyOn(kv, 'set');
    const tokens = new TokenService(jwt, config, kv);
    const issued = await tokens.issue('user-1', Role.NATURAL);

    expect(issued.expiresIn).toBe(ACCESS_TTL_NATURAL_SECONDS);
    expect(issued.tokenType).toBe('Bearer');

    const payload = await jwt.verifyAsync<{
      sub: string;
      role: Role;
      jti?: string;
    }>(issued.accessToken, { algorithms: ['RS256'], publicKey });
    expect(payload.sub).toBe('user-1');
    expect(payload.role).toBe(Role.NATURAL);
    expect('entityType' in payload).toBe(false);
    expect('jti' in payload).toBe(false);
    expect(set.mock.calls[0]?.[2]).toBe(REFRESH_TTL_NATURAL_SECONDS);

    const rotated = await reissue(tokens, issued.refreshToken);
    expect(rotated.refreshToken).not.toBe(issued.refreshToken);
    await expect(reissue(tokens, issued.refreshToken)).rejects.toThrow();
  });

  it('issues JURIDICA access JWT 60m and refresh TTL 30d with entityType', async () => {
    const kv = new MemoryKvStore();
    const set = jest.spyOn(kv, 'set');
    const tokens = new TokenService(jwt, config, kv);
    const issued = await tokens.issue('org-1', Role.JURIDICA, 'empresa');

    expect(issued.expiresIn).toBe(ACCESS_TTL_JURIDICA_SECONDS);
    const payload = await jwt.verifyAsync<{
      sub: string;
      role: Role;
      entityType?: string;
    }>(issued.accessToken, { algorithms: ['RS256'], publicKey });
    expect(payload.role).toBe(Role.JURIDICA);
    expect(payload.entityType).toBe('empresa');
    expect(set.mock.calls[0]?.[2]).toBe(REFRESH_TTL_JURIDICA_SECONDS);
  });

  it('keeps a single live refresh per user', async () => {
    const kv = new MemoryKvStore();
    const tokens = new TokenService(jwt, config, kv);
    const first = await tokens.issue('user-1', Role.NATURAL);
    const second = await tokens.issue('user-1', Role.NATURAL);

    await expect(reissue(tokens, first.refreshToken)).rejects.toThrow();
    const rotated = await reissue(tokens, second.refreshToken);
    expect(rotated.refreshToken).not.toBe(second.refreshToken);
  });

  it('consumes refresh atomically so a concurrent take fails', async () => {
    const kv = new MemoryKvStore();
    const tokens = new TokenService(jwt, config, kv);
    const issued = await tokens.issue('user-1', Role.NATURAL);

    const [first, second] = await Promise.allSettled([
      tokens.takeRefresh(issued.refreshToken),
      tokens.takeRefresh(issued.refreshToken),
    ]);
    const fulfilled = [first, second].filter((r) => r.status === 'fulfilled');
    const rejected = [first, second].filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });

  it('revokes refresh tokens so they cannot rotate', async () => {
    const kv = new MemoryKvStore();
    const tokens = new TokenService(jwt, config, kv);
    const issued = await tokens.issue('user-1', Role.NATURAL);
    await tokens.revoke(issued.refreshToken);
    await expect(reissue(tokens, issued.refreshToken)).rejects.toThrow();
  });
});
