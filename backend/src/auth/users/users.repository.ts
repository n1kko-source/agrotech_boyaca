import { randomUUID } from 'node:crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role as PrismaRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '../../shared/auth/role.enum';
import { phoneLookupHash } from '../phone/phone';

export const PGP_ENCRYPT_OPTIONS = 'cipher-algo=aes256';

export type AuthUser = {
  id: string;
  role: Role;
};

export const USERS_REPOSITORY = Symbol('USERS_REPOSITORY');

export interface UsersRepository {
  findOrCreateNatural(
    phoneE164: string,
    firebaseUid: string | null,
  ): Promise<AuthUser>;
}

@Injectable()
export class PrismaUsersRepository implements UsersRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async findOrCreateNatural(
    phoneE164: string,
    firebaseUid: string | null,
  ): Promise<AuthUser> {
    const pepper = this.config.get<string>('PII_HASH_PEPPER')?.trim();
    const encKey = this.config.get<string>('PII_ENCRYPTION_KEY')?.trim();
    if (!pepper || !encKey) {
      throw new ServiceUnavailableException('PII keys unavailable');
    }
    const phoneHash = phoneLookupHash(phoneE164, pepper);
    const id = randomUUID();
    const rows = await this.prisma.db.$queryRaw<
      { id: string; role: PrismaRole }[]
    >`
      INSERT INTO users (id, role, phone_enc, phone_hash, firebase_uid, created_at, updated_at)
      VALUES (
        ${id}::uuid,
        'NATURAL'::"Role",
        pgp_sym_encrypt(${phoneE164}, ${encKey}, ${PGP_ENCRYPT_OPTIONS}),
        ${phoneHash},
        ${firebaseUid},
        NOW(),
        NOW()
      )
      ON CONFLICT (phone_hash) DO UPDATE SET
        firebase_uid = COALESCE(EXCLUDED.firebase_uid, users.firebase_uid),
        updated_at = NOW()
      RETURNING id, role
    `;
    const row = rows[0];
    if (!row) {
      throw new ServiceUnavailableException('Database unavailable');
    }
    return { id: row.id, role: row.role as Role };
  }
}

@Injectable()
export class InMemoryUsersRepository implements UsersRepository {
  private readonly users = new Map<string, AuthUser>();

  constructor(private readonly config: ConfigService) {}

  findOrCreateNatural(
    phoneE164: string,
    firebaseUid: string | null,
  ): Promise<AuthUser> {
    void firebaseUid;
    const pepper =
      this.config.get<string>('PII_HASH_PEPPER')?.trim() || 'dev-pepper';
    const phoneHash = phoneLookupHash(phoneE164, pepper);
    const existing = this.users.get(phoneHash);
    if (existing) {
      return Promise.resolve(existing);
    }
    const created: AuthUser = { id: randomUUID(), role: Role.NATURAL };
    this.users.set(phoneHash, created);
    return Promise.resolve(created);
  }
}
