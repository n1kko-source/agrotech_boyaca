import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../../shared/auth/role.enum';
import { pemFromEnv } from '../../shared/config/pem';
import { KV_STORE } from '../../shared/redis/kv-store';
import type { KvStore } from '../../shared/redis/kv-store';

export const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;
export const ACCESS_TTL_NATURAL_SECONDS = 15 * 60;
const REFRESH_PREFIX = 'agrotech:refresh:';

export type IssuedTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
};

type RefreshPayload = {
  sub: string;
  role: Role;
};

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(KV_STORE) private readonly kv: KvStore,
  ) {}

  async issue(sub: string, role: Role): Promise<IssuedTokens> {
    const privateKey = pemFromEnv(this.config.get<string>('JWT_PRIVATE_KEY'));
    if (!privateKey) {
      throw new UnauthorizedException('Unauthorized');
    }
    const accessToken = await this.jwt.signAsync(
      { sub, role, jti: randomUUID() },
      {
        algorithm: 'RS256',
        privateKey,
        expiresIn: ACCESS_TTL_NATURAL_SECONDS,
      },
    );
    const refreshToken = randomBytes(32).toString('base64url');
    await this.kv.set(
      refreshKey(refreshToken),
      JSON.stringify({ sub, role } satisfies RefreshPayload),
      REFRESH_TTL_SECONDS,
    );
    return {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TTL_NATURAL_SECONDS,
      tokenType: 'Bearer',
    };
  }

  async rotate(refreshToken: string): Promise<IssuedTokens> {
    const raw = await this.kv.get(refreshKey(refreshToken));
    if (!raw) {
      throw new UnauthorizedException('Unauthorized');
    }
    await this.kv.del(refreshKey(refreshToken));
    const payload = parseRefresh(raw);
    if (!payload) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.issue(payload.sub, payload.role);
  }
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function refreshKey(token: string): string {
  return `${REFRESH_PREFIX}${hashRefreshToken(token)}`;
}

function parseRefresh(raw: string): RefreshPayload | null {
  try {
    const parsed = JSON.parse(raw) as RefreshPayload;
    if (
      !parsed.sub ||
      (parsed.role !== Role.NATURAL && parsed.role !== Role.JURIDICA)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
