import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { rankDocument } from './search/fts';

export type ProfileRecord = {
  id: string;
  userId: string;
  displayName: string;
  municipality: string;
  bio: string;
  category: string;
  createdAt: Date;
  updatedAt: Date;
};

export type RankedProfile = ProfileRecord & { rank: number };

export type UpsertProfileInput = {
  id?: string;
  userId: string;
  displayName: string;
  municipality: string;
  bio: string;
  category: string;
};

export const PROFILES_STORE = Symbol('PROFILES_STORE');

export interface ProfilesStore {
  upsert(input: UpsertProfileInput): Promise<ProfileRecord>;
  findByUserId(userId: string): Promise<ProfileRecord | null>;
  search(q: string, limit: number): Promise<RankedProfile[]>;
}

type RawSearchRow = {
  id: string;
  user_id: string;
  display_name: string;
  municipality: string;
  bio: string;
  category: string;
  created_at: Date;
  updated_at: Date;
  rank: number;
};

@Injectable()
export class PrismaProfilesStore implements ProfilesStore {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(input: UpsertProfileInput): Promise<ProfileRecord> {
    const row = await this.prisma.db.marketplaceProfile.upsert({
      where: { userId: input.userId },
      create: {
        id: input.id ?? randomUUID(),
        userId: input.userId,
        displayName: input.displayName,
        municipality: input.municipality,
        bio: input.bio,
        category: input.category,
      },
      update: {
        displayName: input.displayName,
        municipality: input.municipality,
        bio: input.bio,
        category: input.category,
      },
    });
    return toProfileRecord(row);
  }

  async findByUserId(userId: string): Promise<ProfileRecord | null> {
    const row = await this.prisma.db.marketplaceProfile.findUnique({
      where: { userId },
    });
    return row ? toProfileRecord(row) : null;
  }

  async search(q: string, limit: number): Promise<RankedProfile[]> {
    const rows = await this.prisma.db.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config('pg_trgm.similarity_threshold', '0.2', true)
      `;
      await tx.$executeRaw`
        SELECT set_config('pg_trgm.word_similarity_threshold', '0.35', true)
      `;
      return tx.$queryRaw<RawSearchRow[]>`
        SELECT
          p.id,
          p.user_id,
          p.display_name,
          p.municipality,
          p.bio,
          p.category,
          p.created_at,
          p.updated_at,
          (
            ts_rank_cd(p.search_vector, q.query, 32) * 2.0
            + GREATEST(
                similarity(public.f_unaccent(p.display_name), public.f_unaccent(${q})),
                similarity(public.f_unaccent(p.municipality), public.f_unaccent(${q})),
                similarity(public.f_unaccent(p.category), public.f_unaccent(${q})),
                word_similarity(public.f_unaccent(${q}), public.f_unaccent(p.bio))
              )
          )::float8 AS rank
        FROM marketplace_profiles p
        CROSS JOIN LATERAL (
          SELECT plainto_tsquery('public.spanish_unaccent', public.f_unaccent(${q})) AS query
        ) q
        WHERE
          (q.query <> ''::tsquery AND p.search_vector @@ q.query)
          OR public.f_unaccent(p.display_name) % public.f_unaccent(${q})
          OR public.f_unaccent(p.display_name) %> public.f_unaccent(${q})
          OR public.f_unaccent(p.municipality) % public.f_unaccent(${q})
          OR public.f_unaccent(p.municipality) %> public.f_unaccent(${q})
          OR public.f_unaccent(p.category) % public.f_unaccent(${q})
          OR public.f_unaccent(p.category) %> public.f_unaccent(${q})
          OR public.f_unaccent(p.bio) %> public.f_unaccent(${q})
        ORDER BY rank DESC, p.id ASC
        LIMIT ${limit}
      `;
    });
    return rows.map(toRankedProfile);
  }
}

@Injectable()
export class MemoryProfilesStore implements ProfilesStore {
  readonly byUserId = new Map<string, ProfileRecord>();

  upsert(input: UpsertProfileInput): Promise<ProfileRecord> {
    const existing = this.byUserId.get(input.userId);
    const now = new Date();
    const row: ProfileRecord = {
      id: existing?.id ?? input.id ?? randomUUID(),
      userId: input.userId,
      displayName: input.displayName,
      municipality: input.municipality,
      bio: input.bio,
      category: input.category,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.byUserId.set(input.userId, row);
    return Promise.resolve(row);
  }

  findByUserId(userId: string): Promise<ProfileRecord | null> {
    return Promise.resolve(this.byUserId.get(userId) ?? null);
  }

  search(q: string, limit: number): Promise<RankedProfile[]> {
    const ranked: RankedProfile[] = [];
    for (const row of this.byUserId.values()) {
      const rank = rankDocument(q, {
        a: [row.displayName, row.municipality, row.category],
        b: [row.bio],
      });
      if (rank > 0) {
        ranked.push({ ...row, rank });
      }
    }
    ranked.sort((left, right) => {
      if (right.rank !== left.rank) {
        return right.rank - left.rank;
      }
      return left.id.localeCompare(right.id);
    });
    return Promise.resolve(ranked.slice(0, limit));
  }
}

function toProfileRecord(row: {
  id: string;
  userId: string;
  displayName: string;
  municipality: string;
  bio: string;
  category: string;
  createdAt: Date;
  updatedAt: Date;
}): ProfileRecord {
  return {
    id: row.id,
    userId: row.userId,
    displayName: row.displayName,
    municipality: row.municipality,
    bio: row.bio,
    category: row.category,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toRankedProfile(row: RawSearchRow): RankedProfile {
  return {
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name,
    municipality: row.municipality,
    bio: row.bio,
    category: row.category,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    rank: Number(row.rank),
  };
}
