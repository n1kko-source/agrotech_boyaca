import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { rankDocument } from './search/fts';

export type PostRecord = {
  id: string;
  authorId: string;
  title: string;
  description: string;
  category: string;
  createdAt: Date;
};

export type RankedPost = PostRecord & { rank: number };

export type CreatePostInput = {
  authorId: string;
  title: string;
  description: string;
  category: string;
};

export const POSTS_STORE = Symbol('POSTS_STORE');

export interface PostsStore {
  create(input: CreatePostInput): Promise<PostRecord>;
  findById(id: string): Promise<PostRecord | null>;
  search(q: string, limit: number): Promise<RankedPost[]>;
}

type RawSearchRow = {
  id: string;
  author_id: string;
  title: string;
  description: string;
  category: string;
  created_at: Date;
  rank: number;
};

@Injectable()
export class PrismaPostsStore implements PostsStore {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreatePostInput): Promise<PostRecord> {
    const row = await this.prisma.db.post.create({
      data: {
        id: randomUUID(),
        authorId: input.authorId,
        title: input.title,
        description: input.description,
        category: input.category,
      },
    });
    return toPostRecord(row);
  }

  async findById(id: string): Promise<PostRecord | null> {
    const row = await this.prisma.db.post.findUnique({ where: { id } });
    return row ? toPostRecord(row) : null;
  }

  async search(q: string, limit: number): Promise<RankedPost[]> {
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
          (
            ts_rank_cd(p.search_vector, q.query, 32) * 2.0
            + GREATEST(
                similarity(public.f_unaccent(p.title), public.f_unaccent(${q})),
                similarity(public.f_unaccent(p.category), public.f_unaccent(${q})),
                word_similarity(public.f_unaccent(${q}), public.f_unaccent(p.description))
              )
          )::float8 AS rank
        FROM posts p
        CROSS JOIN LATERAL (
          SELECT plainto_tsquery('public.spanish_unaccent', public.f_unaccent(${q})) AS query
        ) q
        WHERE
          (q.query <> ''::tsquery AND p.search_vector @@ q.query)
          OR public.f_unaccent(p.title) % public.f_unaccent(${q})
          OR public.f_unaccent(p.title) %> public.f_unaccent(${q})
          OR public.f_unaccent(p.category) % public.f_unaccent(${q})
          OR public.f_unaccent(p.category) %> public.f_unaccent(${q})
          OR public.f_unaccent(p.description) %> public.f_unaccent(${q})
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

  create(input: CreatePostInput): Promise<PostRecord> {
    const row: PostRecord = {
      id: randomUUID(),
      authorId: input.authorId,
      title: input.title,
      description: input.description,
      category: input.category,
      createdAt: new Date(),
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  findById(id: string): Promise<PostRecord | null> {
    return Promise.resolve(this.rows.find((row) => row.id === id) ?? null);
  }

  insertMany(rows: PostRecord[]): void {
    this.rows.push(...rows);
  }

  search(q: string, limit: number): Promise<RankedPost[]> {
    const ranked: RankedPost[] = [];
    for (const row of this.rows) {
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
}): PostRecord {
  return {
    id: row.id,
    authorId: row.authorId,
    title: row.title,
    description: row.description,
    category: row.category,
    createdAt: row.createdAt,
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
    rank: Number(row.rank),
  };
}
