import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { CursorPayload } from '../../shared/pagination/cursor';
import type {
  DeletionRequestRow,
  DeletionRequestStore,
} from './deletion-request';

@Injectable()
export class PrismaDeletionRequestStore implements DeletionRequestStore {
  constructor(private readonly prisma: PrismaService) {}

  async request(userId: string): Promise<void> {
    const id = randomUUID();
    await this.prisma.db.$executeRaw`
      INSERT INTO deletion_requests (id, user_id, created_at)
      VALUES (${id}::uuid, ${userId}::uuid, NOW())
      ON CONFLICT (user_id) DO NOTHING
    `;
  }

  async list(
    limit: number,
    cursor?: CursorPayload,
  ): Promise<DeletionRequestRow[]> {
    const take = limit + 1;
    type Raw = { id: string; user_id: string; created_at: Date };
    const rows = cursor
      ? await this.prisma.db.$queryRaw<Raw[]>`
          SELECT id, user_id, created_at
          FROM deletion_requests
          WHERE created_at > ${new Date(cursor.t)}
            OR (created_at = ${new Date(cursor.t)} AND id > ${cursor.id}::uuid)
          ORDER BY created_at ASC, id ASC
          LIMIT ${take}
        `
      : await this.prisma.db.$queryRaw<Raw[]>`
          SELECT id, user_id, created_at
          FROM deletion_requests
          ORDER BY created_at ASC, id ASC
          LIMIT ${take}
        `;
    return rows.map(toRow);
  }
}

@Injectable()
export class MemoryDeletionRequestStore implements DeletionRequestStore {
  readonly rows: DeletionRequestRow[] = [];
  private readonly byUser = new Set<string>();

  request(userId: string): Promise<void> {
    if (this.byUser.has(userId)) {
      return Promise.resolve();
    }
    const created = new Date();
    this.byUser.add(userId);
    this.rows.push({
      id: randomUUID(),
      t: created.getTime(),
      userId,
      createdAt: created.toISOString(),
    });
    return Promise.resolve();
  }

  list(limit: number, cursor?: CursorPayload): Promise<DeletionRequestRow[]> {
    const sorted = [...this.rows].sort(
      (a, b) => a.t - b.t || a.id.localeCompare(b.id),
    );
    const filtered = cursor
      ? sorted.filter(
          (row) =>
            row.t > cursor.t || (row.t === cursor.t && row.id > cursor.id),
        )
      : sorted;
    return Promise.resolve(filtered.slice(0, limit + 1));
  }
}

function toRow(row: {
  id: string;
  user_id: string;
  created_at: Date;
}): DeletionRequestRow {
  return {
    id: row.id,
    t: new Date(row.created_at).getTime(),
    userId: row.user_id,
    createdAt: new Date(row.created_at).toISOString(),
  };
}
