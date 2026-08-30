import { Inject, Injectable } from '@nestjs/common';
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
  constructor(@Inject(POSTS_STORE) private readonly posts: PostsStore) {}

  async create(
    authorId: string,
    input: { title: string; description: string; category: string },
  ): Promise<PostView> {
    const row = await this.posts.create({ authorId, ...input });
    return toPostView(row);
  }

  async search(q: string, limit: number): Promise<SearchPostsResult> {
    const rows = await this.posts.search(q, limit);
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
