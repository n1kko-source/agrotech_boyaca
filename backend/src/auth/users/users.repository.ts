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
import type { CursorPayload } from '../../shared/pagination/cursor';
import { emailLookupHash } from '../email/email';
import {
  ENTITY_TYPE_DB,
  entityTypeFromDb,
  type EntityTypeValue,
} from '../entity-type';
import { maskNit, nitLookupHash } from '../nit/nit';
import { phoneLookupHash } from '../phone/phone';
import { requirePiiKeys, resolvePepper } from '../../shared/config/pii-keys';

export const PGP_ENCRYPT_OPTIONS = 'cipher-algo=aes256';

export type AuthUser = {
  id: string;
  role: Role;
  verified: boolean;
  entityType?: EntityTypeValue;
};

export type CreateJuridicaInput = {
  email: string;
  nit: string;
  entityType: EntityTypeValue;
  firebaseUid: string | null;
  privacyPolicyVersion: string;
};

export type PrivacyConsent = {
  version: string;
  acceptedAt: string;
};

export type CreateAdminInput = {
  email: string;
  firebaseUid: string | null;
};

export type PendingJuridicaRow = {
  id: string;
  t: number;
  entityType: EntityTypeValue;
  createdAt: string;
  nitMasked: string;
};

export const USERS_REPOSITORY = Symbol('USERS_REPOSITORY');

export interface UsersRepository {
  findOrCreateNatural(
    phoneE164: string,
    firebaseUid: string | null,
    privacyPolicyVersion: string,
  ): Promise<AuthUser>;
  createJuridica(input: CreateJuridicaInput): Promise<AuthUser>;
  createAdmin(input: CreateAdminInput): Promise<AuthUser>;
  findJuridicaByEmail(email: string): Promise<AuthUser | null>;
  findJuridicaByNit(nit: string): Promise<AuthUser | null>;
  findAdminByEmail(email: string): Promise<AuthUser | null>;
  findById(userId: string): Promise<AuthUser | null>;
  findPrivacyConsent(userId: string): Promise<PrivacyConsent | null>;
  listPendingJuridica(
    limit: number,
    cursor?: CursorPayload,
  ): Promise<PendingJuridicaRow[]>;
  decryptJuridicaEmail(userId: string): Promise<string | null>;
  setVerified(userId: string, verified: boolean): Promise<boolean>;
}

type UserRow = {
  id: string;
  role: PrismaRole;
  verified: boolean;
  entity_type: string | null;
};

@Injectable()
export class PrismaUsersRepository implements UsersRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async findOrCreateNatural(
    phoneE164: string,
    firebaseUid: string | null,
    privacyPolicyVersion: string,
  ): Promise<AuthUser> {
    const keys = this.requireKeys();
    const phoneHash = phoneLookupHash(phoneE164, keys.pepper);
    const id = randomUUID();
    const rows = await this.prisma.db.$queryRaw<UserRow[]>`
      INSERT INTO users (
        id, role, phone_enc, phone_hash, firebase_uid, verified,
        privacy_policy_version, privacy_policy_accepted_at, created_at, updated_at
      )
      VALUES (
        ${id}::uuid,
        'NATURAL'::"Role",
        pgp_sym_encrypt(${phoneE164}, ${keys.encKey}, ${PGP_ENCRYPT_OPTIONS}),
        ${phoneHash},
        ${firebaseUid},
        true,
        ${privacyPolicyVersion},
        NOW(),
        NOW(),
        NOW()
      )
      ON CONFLICT (phone_hash) DO UPDATE SET
        firebase_uid = COALESCE(EXCLUDED.firebase_uid, users.firebase_uid),
        privacy_policy_version = COALESCE(users.privacy_policy_version, EXCLUDED.privacy_policy_version),
        privacy_policy_accepted_at = COALESCE(users.privacy_policy_accepted_at, EXCLUDED.privacy_policy_accepted_at),
        updated_at = NOW()
      RETURNING id, role, verified, entity_type
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
          entity_type, verified, firebase_uid,
          privacy_policy_version, privacy_policy_accepted_at,
          created_at, updated_at
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
          ${input.privacyPolicyVersion},
          NOW(),
          NOW(),
          NOW()
        )
        RETURNING id, role, verified, entity_type
      `;
      return requireRow(rows[0]);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('Account already exists');
      }
      throw err;
    }
  }

  async createAdmin(input: CreateAdminInput): Promise<AuthUser> {
    const keys = this.requireKeys();
    const emailHash = emailLookupHash(input.email, keys.pepper);
    const id = randomUUID();
    try {
      const rows = await this.prisma.db.$queryRaw<UserRow[]>`
        INSERT INTO users (
          id, role, email_enc, email_hash, verified, firebase_uid, created_at, updated_at
        )
        VALUES (
          ${id}::uuid,
          'ADMIN'::"Role",
          pgp_sym_encrypt(${input.email}, ${keys.encKey}, ${PGP_ENCRYPT_OPTIONS}),
          ${emailHash},
          true,
          ${input.firebaseUid},
          NOW(),
          NOW()
        )
        RETURNING id, role, verified, entity_type
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
      SELECT id, role, verified, entity_type FROM users
      WHERE email_hash = ${emailHash} AND role = 'JURIDICA'::"Role"
      LIMIT 1
    `;
    return toAuthUser(rows[0]);
  }

  async findJuridicaByNit(nit: string): Promise<AuthUser | null> {
    const keys = this.requireKeys();
    const nitHash = nitLookupHash(nit, keys.pepper);
    const rows = await this.prisma.db.$queryRaw<UserRow[]>`
      SELECT id, role, verified, entity_type FROM users
      WHERE nit_hash = ${nitHash} AND role = 'JURIDICA'::"Role"
      LIMIT 1
    `;
    return toAuthUser(rows[0]);
  }

  async findAdminByEmail(email: string): Promise<AuthUser | null> {
    const keys = this.requireKeys();
    const emailHash = emailLookupHash(email, keys.pepper);
    const rows = await this.prisma.db.$queryRaw<UserRow[]>`
      SELECT id, role, verified, entity_type FROM users
      WHERE email_hash = ${emailHash} AND role = 'ADMIN'::"Role"
      LIMIT 1
    `;
    return toAuthUser(rows[0]);
  }

  async findById(userId: string): Promise<AuthUser | null> {
    const rows = await this.prisma.db.$queryRaw<UserRow[]>`
      SELECT id, role, verified, entity_type FROM users
      WHERE id = ${userId}::uuid
      LIMIT 1
    `;
    return toAuthUser(rows[0]);
  }

  async findPrivacyConsent(userId: string): Promise<PrivacyConsent | null> {
    const rows = await this.prisma.db.$queryRaw<
      {
        privacy_policy_version: string | null;
        privacy_policy_accepted_at: Date | null;
      }[]
    >`
      SELECT privacy_policy_version, privacy_policy_accepted_at
      FROM users
      WHERE id = ${userId}::uuid
      LIMIT 1
    `;
    return toPrivacyConsent(rows[0]);
  }

  async listPendingJuridica(
    limit: number,
    cursor?: CursorPayload,
  ): Promise<PendingJuridicaRow[]> {
    const keys = this.requireKeys();
    const take = limit + 1;
    type RawPending = {
      id: string;
      entity_type: string;
      created_at: Date;
      nit: string | null;
    };
    const rows = cursor
      ? await this.prisma.db.$queryRaw<RawPending[]>`
          SELECT id, entity_type, created_at,
            pgp_sym_decrypt(nit_enc, ${keys.encKey}) AS nit
          FROM users
          WHERE role = 'JURIDICA'::"Role" AND verified = false
            AND (
              created_at > ${new Date(cursor.t)}
              OR (created_at = ${new Date(cursor.t)} AND id > ${cursor.id}::uuid)
            )
          ORDER BY created_at ASC, id ASC
          LIMIT ${take}
        `
      : await this.prisma.db.$queryRaw<RawPending[]>`
          SELECT id, entity_type, created_at,
            pgp_sym_decrypt(nit_enc, ${keys.encKey}) AS nit
          FROM users
          WHERE role = 'JURIDICA'::"Role" AND verified = false
          ORDER BY created_at ASC, id ASC
          LIMIT ${take}
        `;
    const mapped: PendingJuridicaRow[] = [];
    for (const row of rows) {
      const entityType = entityTypeFromDb(row.entity_type);
      if (!entityType || !row.nit) {
        continue;
      }
      mapped.push({
        id: row.id,
        t: new Date(row.created_at).getTime(),
        entityType,
        createdAt: new Date(row.created_at).toISOString(),
        nitMasked: maskNit(row.nit),
      });
    }
    return mapped;
  }

  async decryptJuridicaEmail(userId: string): Promise<string | null> {
    const keys = this.requireKeys();
    const rows = await this.prisma.db.$queryRaw<{ email: string | null }[]>`
      SELECT pgp_sym_decrypt(email_enc, ${keys.encKey}) AS email
      FROM users
      WHERE id = ${userId}::uuid AND role = 'JURIDICA'::"Role"
      LIMIT 1
    `;
    const email = rows[0]?.email;
    return email && email.length > 0 ? email : null;
  }

  async setVerified(userId: string, verified: boolean): Promise<boolean> {
    const rows = await this.prisma.db.$queryRaw<UserRow[]>`
      UPDATE users SET verified = ${verified}, updated_at = NOW()
      WHERE id = ${userId}::uuid AND role = 'JURIDICA'::"Role"
      RETURNING id, role, verified, entity_type
    `;
    return Boolean(rows[0]);
  }

  private requireKeys(): { pepper: string; encKey: string } {
    return requirePiiKeys(this.config);
  }
}

@Injectable()
export class InMemoryUsersRepository implements UsersRepository {
  private readonly byId = new Map<string, AuthUser>();
  private readonly byPhoneHash = new Map<string, string>();
  private readonly byEmailHash = new Map<string, string>();
  private readonly byNitHash = new Map<string, string>();
  private readonly emails = new Map<string, string>();
  private readonly nits = new Map<string, string>();
  private readonly entityTypes = new Map<string, EntityTypeValue>();
  private readonly createdAt = new Map<string, Date>();
  private readonly privacyConsent = new Map<string, PrivacyConsent>();

  constructor(private readonly config: ConfigService) {}

  findOrCreateNatural(
    phoneE164: string,
    firebaseUid: string | null,
    privacyPolicyVersion: string,
  ): Promise<AuthUser> {
    void firebaseUid;
    const phoneHash = phoneLookupHash(phoneE164, this.pepper());
    const existingId = this.byPhoneHash.get(phoneHash);
    const existing = existingId ? this.byId.get(existingId) : undefined;
    if (existing) {
      this.rememberConsent(existing.id, privacyPolicyVersion);
      return Promise.resolve(existing);
    }
    const created: AuthUser = {
      id: randomUUID(),
      role: Role.NATURAL,
      verified: true,
    };
    this.byId.set(created.id, created);
    this.byPhoneHash.set(phoneHash, created.id);
    this.createdAt.set(created.id, new Date());
    this.rememberConsent(created.id, privacyPolicyVersion);
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
      entityType: input.entityType,
    };
    this.byId.set(created.id, created);
    this.byEmailHash.set(emailHash, created.id);
    this.byNitHash.set(nitHash, created.id);
    this.emails.set(created.id, input.email);
    this.nits.set(created.id, input.nit);
    this.entityTypes.set(created.id, input.entityType);
    this.createdAt.set(created.id, new Date());
    this.rememberConsent(created.id, input.privacyPolicyVersion);
    return Promise.resolve(created);
  }

  createAdmin(input: CreateAdminInput): Promise<AuthUser> {
    const emailHash = emailLookupHash(input.email, this.pepper());
    if (this.byEmailHash.has(emailHash)) {
      return Promise.reject(new ConflictException('Account already exists'));
    }
    const created: AuthUser = {
      id: randomUUID(),
      role: Role.ADMIN,
      verified: true,
    };
    this.byId.set(created.id, created);
    this.byEmailHash.set(emailHash, created.id);
    this.emails.set(created.id, input.email);
    this.createdAt.set(created.id, new Date());
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

  findAdminByEmail(email: string): Promise<AuthUser | null> {
    const id = this.byEmailHash.get(emailLookupHash(email, this.pepper()));
    if (!id) {
      return Promise.resolve(null);
    }
    const user = this.byId.get(id);
    if (!user || user.role !== Role.ADMIN) {
      return Promise.resolve(null);
    }
    return Promise.resolve(user);
  }

  findById(userId: string): Promise<AuthUser | null> {
    return Promise.resolve(this.byId.get(userId) ?? null);
  }

  findPrivacyConsent(userId: string): Promise<PrivacyConsent | null> {
    return Promise.resolve(this.privacyConsent.get(userId) ?? null);
  }

  listPendingJuridica(
    limit: number,
    cursor?: CursorPayload,
  ): Promise<PendingJuridicaRow[]> {
    const rows: PendingJuridicaRow[] = [];
    for (const user of this.byId.values()) {
      if (user.role !== Role.JURIDICA || user.verified) {
        continue;
      }
      const entityType = this.entityTypes.get(user.id);
      const nit = this.nits.get(user.id);
      const created = this.createdAt.get(user.id);
      if (!entityType || !nit || !created) {
        continue;
      }
      const t = created.getTime();
      if (
        cursor &&
        (t < cursor.t || (t === cursor.t && user.id <= cursor.id))
      ) {
        continue;
      }
      rows.push({
        id: user.id,
        t,
        entityType,
        createdAt: created.toISOString(),
        nitMasked: maskNit(nit),
      });
    }
    rows.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
    return Promise.resolve(rows.slice(0, limit + 1));
  }

  decryptJuridicaEmail(userId: string): Promise<string | null> {
    const user = this.byId.get(userId);
    if (!user || user.role !== Role.JURIDICA) {
      return Promise.resolve(null);
    }
    return Promise.resolve(this.emails.get(userId) ?? null);
  }

  setVerified(userId: string, verified: boolean): Promise<boolean> {
    const user = this.byId.get(userId);
    if (!user || user.role !== Role.JURIDICA) {
      return Promise.resolve(false);
    }
    user.verified = verified;
    return Promise.resolve(true);
  }

  private rememberConsent(userId: string, version: string): void {
    if (this.privacyConsent.has(userId)) {
      return;
    }
    this.privacyConsent.set(userId, {
      version,
      acceptedAt: new Date().toISOString(),
    });
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
    return resolvePepper(this.config);
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
  const role = row.role as Role;
  const entityType =
    role === Role.JURIDICA && row.entity_type
      ? entityTypeFromDb(row.entity_type)
      : null;
  return {
    id: row.id,
    role,
    verified: row.verified,
    ...(entityType ? { entityType } : {}),
  };
}

function toPrivacyConsent(
  row:
    | {
        privacy_policy_version: string | null;
        privacy_policy_accepted_at: Date | null;
      }
    | undefined,
): PrivacyConsent | null {
  if (!row?.privacy_policy_version || !row.privacy_policy_accepted_at) {
    return null;
  }
  return {
    version: row.privacy_policy_version,
    acceptedAt: new Date(row.privacy_policy_accepted_at).toISOString(),
  };
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
