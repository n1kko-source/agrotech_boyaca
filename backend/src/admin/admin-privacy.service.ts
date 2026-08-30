import { Inject, Injectable } from '@nestjs/common';
import { DELETION_REQUESTS } from '../auth/privacy/deletion-request';
import type { DeletionRequestStore } from '../auth/privacy/deletion-request';
import {
  decodeCursor,
  paginate,
  type Paginated,
} from '../shared/pagination/cursor';

export type DeletionRequestView = {
  id: string;
  userId: string;
  createdAt: string;
};

@Injectable()
export class AdminPrivacyService {
  constructor(
    @Inject(DELETION_REQUESTS) private readonly deletions: DeletionRequestStore,
  ) {}

  async listDeletionRequests(
    limit: number,
    cursor?: string,
  ): Promise<Paginated<DeletionRequestView>> {
    const decoded = cursor ? decodeCursor(cursor) : undefined;
    const rows = await this.deletions.list(limit, decoded);
    const page = paginate(rows, limit);
    return {
      items: page.items.map((row) => ({
        id: row.id,
        userId: row.userId,
        createdAt: row.createdAt,
      })),
      nextCursor: page.nextCursor,
    };
  }
}
