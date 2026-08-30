import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../../shared/auth/role.enum';
import { pemFromEnv } from '../../shared/config/pem';
import { KV_STORE } from '../../shared/redis/kv-store';
import type { KvStore } from '../../shared/redis/kv-store';
import { isEntityType, type EntityTypeValue } from '../entity-type';

export const ACCESS_TTL_NATURAL_SECONDS = 15 * 60;
export const ACCESS_TTL_JURIDICA_SECONDS = 60 * 60;
export const ACCESS_TTL_ADMIN_SECONDS = 60 * 60;
export const REFRESH_TTL_NATURAL_SECONDS = 7 * 24 * 60 * 60;
export const REFRESH_TTL_JURIDICA_SECONDS = 30 * 24 * 60 * 60;
export const REFRESH_TTL_ADMIN_SECONDS = 7 * 24 * 60 * 60;
const REFRESH_PREFIX = 'agrotech:refresh:';
const SESSION_PREFIX = 'agrotech:refresh-session:';

export type IssuedTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
};

export type RefreshPayload = {
  sub: string;
  role: Role;
  entityType?: EntityTypeValue;
};

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(KV_STORE) private readonly kv: KvStore,
  ) {}

  async issue(
    sub: string,
    role: Role,
    entityType?: EntityTypeValue,
  ): Promise<IssuedTokens> {
    const privateKey = pemFromEnv(this.config.get<string>('JWT_PRIVATE_KEY'));
    if (!privateKey) {
      throw new UnauthorizedException('Unauthorized');
    }
    const accessTtl = accessTtlSeconds(role);
    const refreshTtl = refreshTtlSeconds(role);
    const profile = profileClaims(role, entityType);
    const accessToken = await this.jwt.signAsync(
      { sub, role, ...profile },
      {
        algorithm: 'RS256',
        privateKey,
        expiresIn: accessTtl,
      },
    );
    await this.dropPreviousRefresh(sub);
    const refreshToken = randomBytes(32).toString('base64url');
    const tokenHash = hashRefreshToken(refreshToken);
    await this.kv.set(
      refreshRecordKey(tokenHash),
      JSON.stringify({ sub, role, ...profile } satisfies RefreshPayload),
      refreshTtl,
    );
    await this.kv.set(sessionKey(sub), tokenHash, refreshTtl);
    return {
      accessToken,
      refreshToken,
      expiresIn: accessTtl,
      tokenType: 'Bearer',
    };
  }

  async takeRefresh(refreshToken: string): Promise<RefreshPayload> {
    const raw = await this.kv.getdel(refreshKey(refreshToken));
    if (!raw) {
      throw new UnauthorizedException('Unauthorized');
    }
    const payload = parseRefresh(raw);
    if (!payload) {
      throw new UnauthorizedException('Unauthorized');
    }
    return payload;
  }

  async revoke(refreshToken: string): Promise<void> {
    const tokenHash = hashRefreshToken(refreshToken);
    const raw = await this.kv.getdel(refreshKey(refreshToken));
    const payload = raw ? parseRefresh(raw) : null;
    if (!payload) {
      return;
    }
    const current = await this.kv.get(sessionKey(payload.sub));
    if (current === tokenHash) {
      await this.kv.del(sessionKey(payload.sub));
    }
  }

  private async dropPreviousRefresh(sub: string): Promise<void> {
    const previousHash = await this.kv.get(sessionKey(sub));
    if (previousHash) {
      await this.kv.del(refreshRecordKey(previousHash));
    }
  }
}

function accessTtlSeconds(role: Role): number {
  if (role === Role.JURIDICA || role === Role.ADMIN) {
    return role === Role.ADMIN
      ? ACCESS_TTL_ADMIN_SECONDS
      : ACCESS_TTL_JURIDICA_SECONDS;
  }
  return ACCESS_TTL_NATURAL_SECONDS;
}

function refreshTtlSeconds(role: Role): number {
  if (role === Role.JURIDICA) {
    return REFRESH_TTL_JURIDICA_SECONDS;
  }
  if (role === Role.ADMIN) {
    return REFRESH_TTL_ADMIN_SECONDS;
  }
  return REFRESH_TTL_NATURAL_SECONDS;
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function refreshKey(token: string): string {
  return refreshRecordKey(hashRefreshToken(token));
}

function refreshRecordKey(tokenHash: string): string {
  return `${REFRESH_PREFIX}${tokenHash}`;
}

function sessionKey(sub: string): string {
  return `${SESSION_PREFIX}${sub}`;
}

function profileClaims(
  role: Role,
  entityType?: EntityTypeValue,
): Pick<RefreshPayload, 'entityType'> {
  if (role === Role.JURIDICA && isEntityType(entityType)) {
    return { entityType };
  }
  return {};
}

function parseRefresh(raw: string): RefreshPayload | null {
  try {
    const parsed = JSON.parse(raw) as RefreshPayload;
    if (
      !parsed.sub ||
      (parsed.role !== Role.NATURAL &&
        parsed.role !== Role.JURIDICA &&
        parsed.role !== Role.ADMIN)
    ) {
      return null;
    }
    return {
      sub: parsed.sub,
      role: parsed.role,
      ...profileClaims(parsed.role, parsed.entityType),
    };
  } catch {
    return null;
  }
}
