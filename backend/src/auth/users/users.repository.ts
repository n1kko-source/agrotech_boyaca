import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role as PrismaRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '../../shared/auth/role.enum';
import { emailLookupHash } from '../email/email';
import { ENTITY_TYPE_DB, type EntityTypeValue } from '../entity-type';
import { nitLookupHash } from '../nit/nit';
import { phoneLookupHash } from '../phone/phone';

export const PGP_ENCRYPT_OPTIONS = 'cipher-algo=aes256';

export type AuthUser = {
  id: string;
  role: Role;
  verified: boolean;
};

export type CreateJuridicaInput = {
  email: string;
  nit: string;
  entityType: EntityTypeValue;
  firebaseUid: string | null;
};

export const USERS_REPOSITORY = Symbol('USERS_REPOSITORY');

export interface UsersRepository {
  findOrCreateNatural(
    phoneE164: string,
    firebaseUid: string | null,
  ): Promise<AuthUser>;
  createJuridica(input: CreateJuridicaInput): Promise<AuthUser>;
  findJuridicaByEmail(email: string): Promise<AuthUser | null>;
  findJuridicaByNit(nit: string): Promise<AuthUser | null>;
  findById(userId: string): Promise<AuthUser | null>;
  setVerified(userId: string, verified: boolean): Promise<boolean>;
}

type UserRow = { id: string; role: PrismaRole; verified: boolean };

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
    const keys = this.requireKeys();
    const phoneHash = phoneLookupHash(phoneE164, keys.pepper);
    const id = randomUUID();
    const rows = await this.prisma.db.$queryRaw<UserRow[]>`
      INSERT INTO users (id, role, phone_enc, phone_hash, firebase_uid, verified, created_at, updated_at)
      VALUES (
        ${id}::uuid,
        'NATURAL'::"Role",
        pgp_sym_encrypt(${phoneE164}, ${keys.encKey}, ${PGP_ENCRYPT_OPTIONS}),
        ${phoneHash},
        ${firebaseUid},
        true,
        NOW(),
        NOW()
      )
      ON CONFLICT (phone_hash) DO UPDATE SET
        firebase_uid = COALESCE(EXCLUDED.firebase_uid, users.firebase_uid),
        updated_at = NOW()
      RETURNING id, role, verified
    `;
    return requireRow(rows[0]);
  }

  async createJuridica(input: CreateJuridicaInput): Promise<AuthUser> {
    const keys = this.requireKeys();
    const emailHash = emailLookupHash(input.email, keys.pepper);
    const nitHash = nitLookupHash(input.nit, keys.pepper);
    const entityType = ENTITY_TYPE_DB[input.entityType];
    const id = randomUUID();
    try {
      const rows = await this.prisma.db.$queryRaw<UserRow[]>`
        INSERT INTO users (
          id, role, email_enc, email_hash, nit_enc, nit_hash,
          entity_type, verified, firebase_uid, created_at, updated_at
        )
        VALUES (
          ${id}::uuid,
          'JURIDICA'::"Role",
          pgp_sym_encrypt(${input.email}, ${keys.encKey}, ${PGP_ENCRYPT_OPTIONS}),
          ${emailHash},
          pgp_sym_encrypt(${input.nit}, ${keys.encKey}, ${PGP_ENCRYPT_OPTIONS}),
          ${nitHash},
          ${entityType}::"EntityType",
          false,
          ${input.firebaseUid},
          NOW(),
          NOW()
        )
        RETURNING id, role, verified
      `;
      return requireRow(rows[0]);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('Account already exists');
      }
      throw err;
    }
  }

  async findJuridicaByEmail(email: string): Promise<AuthUser | null> {
    const keys = this.requireKeys();
    const emailHash = emailLookupHash(email, keys.pepper);
    const rows = await this.prisma.db.$queryRaw<UserRow[]>`
      SELECT id, role, verified FROM users
      WHERE email_hash = ${emailHash} AND role = 'JURIDICA'::"Role"
      LIMIT 1
    `;
    return toAuthUser(rows[0]);
  }

  async findJuridicaByNit(nit: string): Promise<AuthUser | null> {
    const keys = this.requireKeys();
    const nitHash = nitLookupHash(nit, keys.pepper);
    const rows = await this.prisma.db.$queryRaw<UserRow[]>`
      SELECT id, role, verified FROM users
      WHERE nit_hash = ${nitHash} AND role = 'JURIDICA'::"Role"
      LIMIT 1
    `;
    return toAuthUser(rows[0]);
  }

  async findById(userId: string): Promise<AuthUser | null> {
    const rows = await this.prisma.db.$queryRaw<UserRow[]>`
      SELECT id, role, verified FROM users
      WHERE id = ${userId}::uuid
      LIMIT 1
    `;
    return toAuthUser(rows[0]);
  }

  async setVerified(userId: string, verified: boolean): Promise<boolean> {
    const rows = await this.prisma.db.$queryRaw<UserRow[]>`
      UPDATE users SET verified = ${verified}, updated_at = NOW()
      WHERE id = ${userId}::uuid
      RETURNING id, role, verified
    `;
    return Boolean(rows[0]);
  }

  private requireKeys(): { pepper: string; encKey: string } {
    const pepper = this.config.get<string>('PII_HASH_PEPPER')?.trim();
    const encKey = this.config.get<string>('PII_ENCRYPTION_KEY')?.trim();
    if (!pepper || !encKey) {
      throw new ServiceUnavailableException('PII keys unavailable');
    }
    return { pepper, encKey };
  }
}

@Injectable()
export class InMemoryUsersRepository implements UsersRepository {
  private readonly byId = new Map<string, AuthUser>();
  private readonly byPhoneHash = new Map<string, string>();
  private readonly byEmailHash = new Map<string, string>();
  private readonly byNitHash = new Map<string, string>();

  constructor(private readonly config: ConfigService) {}

  findOrCreateNatural(
    phoneE164: string,
    firebaseUid: string | null,
  ): Promise<AuthUser> {
    void firebaseUid;
    const phoneHash = phoneLookupHash(phoneE164, this.pepper());
    const existingId = this.byPhoneHash.get(phoneHash);
    const existing = existingId ? this.byId.get(existingId) : undefined;
    if (existing) {
      return Promise.resolve(existing);
    }
    const created: AuthUser = {
      id: randomUUID(),
      role: Role.NATURAL,
      verified: true,
    };
    this.byId.set(created.id, created);
    this.byPhoneHash.set(phoneHash, created.id);
    return Promise.resolve(created);
  }

  createJuridica(input: CreateJuridicaInput): Promise<AuthUser> {
    const emailHash = emailLookupHash(input.email, this.pepper());
    const nitHash = nitLookupHash(input.nit, this.pepper());
    if (this.byEmailHash.has(emailHash) || this.byNitHash.has(nitHash)) {
      return Promise.reject(new ConflictException('Account already exists'));
    }
    const created: AuthUser = {
      id: randomUUID(),
      role: Role.JURIDICA,
      verified: false,
    };
    this.byId.set(created.id, created);
    this.byEmailHash.set(emailHash, created.id);
    this.byNitHash.set(nitHash, created.id);
    return Promise.resolve(created);
  }

  findJuridicaByEmail(email: string): Promise<AuthUser | null> {
    const id = this.byEmailHash.get(emailLookupHash(email, this.pepper()));
    return Promise.resolve(this.juridica(id));
  }

  findJuridicaByNit(nit: string): Promise<AuthUser | null> {
    const id = this.byNitHash.get(nitLookupHash(nit, this.pepper()));
    return Promise.resolve(this.juridica(id));
  }

  findById(userId: string): Promise<AuthUser | null> {
    return Promise.resolve(this.byId.get(userId) ?? null);
  }

  setVerified(userId: string, verified: boolean): Promise<boolean> {
    const user = this.byId.get(userId);
    if (!user) {
      return Promise.resolve(false);
    }
    user.verified = verified;
    return Promise.resolve(true);
  }

  private juridica(id: string | undefined): AuthUser | null {
    if (!id) {
      return null;
    }
    const user = this.byId.get(id);
    if (!user || user.role !== Role.JURIDICA) {
      return null;
    }
    return user;
  }

  private pepper(): string {
    return this.config.get<string>('PII_HASH_PEPPER')?.trim() || 'dev-pepper';
  }
}

function requireRow(row: UserRow | undefined): AuthUser {
  const user = toAuthUser(row);
  if (!user) {
    throw new ServiceUnavailableException('Database unavailable');
  }
  return user;
}

function toAuthUser(row: UserRow | undefined): AuthUser | null {
  if (!row) {
    return null;
  }
  return { id: row.id, role: row.role as Role, verified: row.verified };
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object' || !('code' in err)) {
    return false;
  }
  const code = (err as { code?: string }).code;
  if (code === 'P2002' || code === '23505') {
    return true;
  }
  if (code === 'P2010') {
    const meta = (err as { meta?: { code?: string } }).meta;
    return meta?.code === '23505';
  }
  return false;
}
