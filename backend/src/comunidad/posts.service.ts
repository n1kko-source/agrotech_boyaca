import { Inject, Injectable, Optional } from '@nestjs/common';
import { decodeCursor, paginate } from '../shared/pagination/cursor';
import type { Paginated } from '../shared/pagination/cursor';
import { CLOCK, systemClock, type Clock } from '../suscripciones/clock';
import { isListed } from '../suscripciones/subscription-status';
import {
  SUBSCRIPTIONS_STORE,
  type SubscriptionsStore,
} from '../suscripciones/subscriptions.store';
import { POSTS_STORE } from './posts.store';
import type { PostsStore, RankedPost, PostRecord } from './posts.store';

export type PostView = {
  id: string;
  authorId: string;
  title: string;
  description: string;
  category: string;
  createdAt: string;
};

export type RankedPostView = PostView & { rank: number };

export type SearchPostsResult = {
  items: RankedPostView[];
};

@Injectable()
export class PostsService {
  constructor(
    @Inject(POSTS_STORE) private readonly posts: PostsStore,
    @Optional()
    @Inject(SUBSCRIPTIONS_STORE)
    private readonly subscriptions?: SubscriptionsStore,
    @Optional() @Inject(CLOCK) clock?: Clock,
  ) {
    this.clock = clock ?? systemClock;
  }

  private readonly clock: Clock;

  async create(
    authorId: string,
    input: {
      title: string;
      description: string;
      category: string;
      id?: string;
    },
  ): Promise<PostView> {
    const row = await this.posts.create({ authorId, ...input });
    return toPostView(row);
  }

  async updateOwn(
    authorId: string,
    id: string,
    input: { title: string; description: string; category: string },
  ): Promise<PostView | null> {
    const existing = await this.posts.findById(id);
    if (!existing || existing.authorId !== authorId) {
      return null;
    }
    const row = await this.posts.update(id, input);
    return row ? toPostView(row) : null;
  }

  findById(id: string): Promise<PostRecord | null> {
    return this.posts.findById(id);
  }

  async getForViewer(viewerId: string, id: string): Promise<PostView | null> {
    const post = await this.posts.findById(id);
    if (!post) {
      return null;
    }
    if (post.authorId === viewerId) {
      return toPostView(post);
    }
    const sub = this.subscriptions
      ? await this.subscriptions.findByUserId(post.authorId)
      : null;
    if (!isListed(sub?.currentPeriodEnd ?? null, this.clock())) {
      return null;
    }
    return toPostView(post);
  }

  async deleteOwn(authorId: string, id: string): Promise<boolean> {
    const existing = await this.posts.findById(id);
    if (!existing || existing.authorId !== authorId) {
      return false;
    }
    return this.posts.delete(id);
  }

  listMineSince(
    authorId: string,
    since: Date,
    limit: number,
  ): Promise<PostRecord[]> {
    return this.posts.listByAuthorSince(authorId, since, limit);
  }

  async list(limit: number, cursor?: string): Promise<Paginated<PostView>> {
    const decoded = cursor ? decodeCursor(cursor) : undefined;
    const rows = await this.posts.listListed(limit, decoded, this.clock());
    const page = paginate(
      rows.map((row) => ({ ...row, t: row.createdAt.getTime() })),
      limit,
    );
    return {
      items: page.items.map((row) => toPostView(row)),
      nextCursor: page.nextCursor,
    };
  }

  async search(q: string, limit: number): Promise<SearchPostsResult> {
    const rows = await this.posts.search(q, limit, this.clock());
    return { items: rows.map(toRankedPostView) };
  }
}

function toPostView(row: PostRecord): PostView {
  return {
    id: row.id,
    authorId: row.authorId,
    title: row.title,
    description: row.description,
    category: row.category,
    createdAt: row.createdAt.toISOString(),
  };
}

function toRankedPostView(row: RankedPost): RankedPostView {
  return { ...toPostView(row), rank: row.rank };
}
