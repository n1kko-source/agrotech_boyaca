import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isListed } from '../suscripciones/subscription-status';
import type { SubscriptionsStore } from '../suscripciones/subscriptions.store';
import { rankDocument } from './search/fts';

export type PostRecord = {
  id: string;
  authorId: string;
  title: string;
  description: string;
  category: string;
  createdAt: Date;
  updatedAt: Date;
};

export type RankedPost = PostRecord & { rank: number };

export type CreatePostInput = {
  id?: string;
  authorId: string;
  title: string;
  description: string;
  category: string;
};

export type UpdatePostInput = {
  title: string;
  description: string;
  category: string;
};

export const POSTS_STORE = Symbol('POSTS_STORE');

export interface PostsStore {
  create(input: CreatePostInput): Promise<PostRecord>;
  update(id: string, input: UpdatePostInput): Promise<PostRecord | null>;
  findById(id: string): Promise<PostRecord | null>;
  listByAuthorSince(
    authorId: string,
    since: Date,
    limit: number,
  ): Promise<PostRecord[]>;
  search(q: string, limit: number, asOf?: Date): Promise<RankedPost[]>;
}

type RawSearchRow = {
  id: string;
  author_id: string;
  title: string;
  description: string;
  category: string;
  created_at: Date;
  updated_at: Date;
  rank: number;
};

@Injectable()
export class PrismaPostsStore implements PostsStore {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreatePostInput): Promise<PostRecord> {
    const row = await this.prisma.db.post.create({
      data: {
        id: input.id ?? randomUUID(),
        authorId: input.authorId,
        title: input.title,
        description: input.description,
        category: input.category,
      },
    });
    return toPostRecord(row);
  }

  async update(id: string, input: UpdatePostInput): Promise<PostRecord | null> {
    const existing = await this.prisma.db.post.findUnique({ where: { id } });
    if (!existing) {
      return null;
    }
    const row = await this.prisma.db.post.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description,
        category: input.category,
      },
    });
    return toPostRecord(row);
  }

  async listByAuthorSince(
    authorId: string,
    since: Date,
    limit: number,
  ): Promise<PostRecord[]> {
    const rows = await this.prisma.db.post.findMany({
      where: { authorId, updatedAt: { gt: since } },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    return rows.map(toPostRecord);
  }

  async findById(id: string): Promise<PostRecord | null> {
    const row = await this.prisma.db.post.findUnique({ where: { id } });
    return row ? toPostRecord(row) : null;
  }

  async search(
    q: string,
    limit: number,
    asOf = new Date(),
  ): Promise<RankedPost[]> {
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
          p.author_id,
          p.title,
          p.description,
          p.category,
          p.created_at,
          p.updated_at,
          (
            ts_rank_cd(p.search_vector, q.query, 32) * 2.0
            + GREATEST(
                similarity(public.f_unaccent(p.title), public.f_unaccent(${q})),
                similarity(public.f_unaccent(p.category), public.f_unaccent(${q})),
                word_similarity(public.f_unaccent(${q}), public.f_unaccent(p.description))
              )
          )::float8 AS rank
        FROM posts p
        INNER JOIN subscriptions s ON s.user_id = p.author_id
        CROSS JOIN LATERAL (
          SELECT plainto_tsquery('public.spanish_unaccent', public.f_unaccent(${q})) AS query
        ) q
        WHERE
          s.current_period_end + INTERVAL '4 days' >= ${asOf}
          AND (
            (q.query <> ''::tsquery AND p.search_vector @@ q.query)
            OR public.f_unaccent(p.title) % public.f_unaccent(${q})
            OR public.f_unaccent(p.title) %> public.f_unaccent(${q})
            OR public.f_unaccent(p.category) % public.f_unaccent(${q})
            OR public.f_unaccent(p.category) %> public.f_unaccent(${q})
            OR public.f_unaccent(p.description) %> public.f_unaccent(${q})
          )
        ORDER BY rank DESC, p.id ASC
        LIMIT ${limit}
      `;
    });
    return rows.map(toRankedPost);
  }
}

@Injectable()
export class MemoryPostsStore implements PostsStore {
  readonly rows: PostRecord[] = [];

  constructor(private readonly subscriptions?: SubscriptionsStore) {}

  create(input: CreatePostInput): Promise<PostRecord> {
    const now = new Date();
    const row: PostRecord = {
      id: input.id ?? randomUUID(),
      authorId: input.authorId,
      title: input.title,
      description: input.description,
      category: input.category,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  update(id: string, input: UpdatePostInput): Promise<PostRecord | null> {
    const row = this.rows.find((item) => item.id === id);
    if (!row) {
      return Promise.resolve(null);
    }
    row.title = input.title;
    row.description = input.description;
    row.category = input.category;
    row.updatedAt = new Date();
    return Promise.resolve(row);
  }

  listByAuthorSince(
    authorId: string,
    since: Date,
    limit: number,
  ): Promise<PostRecord[]> {
    const sinceMs = since.getTime();
    const rows = this.rows
      .filter(
        (row) => row.authorId === authorId && row.updatedAt.getTime() > sinceMs,
      )
      .sort((left, right) => {
        const delta = left.updatedAt.getTime() - right.updatedAt.getTime();
        if (delta !== 0) {
          return delta;
        }
        return left.id.localeCompare(right.id);
      })
      .slice(0, limit);
    return Promise.resolve(rows);
  }

  findById(id: string): Promise<PostRecord | null> {
    return Promise.resolve(this.rows.find((row) => row.id === id) ?? null);
  }

  insertMany(rows: PostRecord[]): void {
    this.rows.push(...rows);
  }

  search(q: string, limit: number, asOf = new Date()): Promise<RankedPost[]> {
    const ranked: RankedPost[] = [];
    for (const row of this.rows) {
      if (
        this.subscriptions &&
        !isListed(this.subscriptions.getPeriodEnd(row.authorId), asOf)
      ) {
        continue;
      }
      const rank = rankDocument(q, {
        a: [row.title, row.category],
        b: [row.description],
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

function toPostRecord(row: {
  id: string;
  authorId: string;
  title: string;
  description: string;
  category: string;
  createdAt: Date;
  updatedAt: Date;
}): PostRecord {
  return {
    id: row.id,
    authorId: row.authorId,
    title: row.title,
    description: row.description,
    category: row.category,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toRankedPost(row: RawSearchRow): RankedPost {
  return {
    id: row.id,
    authorId: row.author_id,
    title: row.title,
    description: row.description,
    category: row.category,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    rank: Number(row.rank),
  };
}
