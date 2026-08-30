import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { NotificationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PENDING_MAX_AGE_MS } from './notification.constants';

export type InboxStatus = 'PENDING' | 'SENT' | 'DELIVERED';

export type InboxRecord = {
  id: string;
  userId: string;
  title: string;
  body: string;
  data: Record<string, string>;
  status: InboxStatus;
  createdAt: Date;
};

export type EnqueueInput = {
  userId: string;
  title: string;
  body: string;
  data: Record<string, string>;
};

export const INBOX = Symbol('INBOX');

export interface InboxStore {
  enqueue(input: EnqueueInput): Promise<InboxRecord>;
  listPending(userId: string, limit: number): Promise<InboxRecord[]>;
  listUnacked(userId: string, limit: number): Promise<InboxRecord[]>;
  markSent(ids: string[]): Promise<void>;
  markDelivered(userId: string, ids: string[]): Promise<number>;
}

@Injectable()
export class PrismaInboxStore implements InboxStore {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(input: EnqueueInput): Promise<InboxRecord> {
    const row = await this.prisma.db.notification.create({
      data: {
        id: randomUUID(),
        userId: input.userId,
        title: input.title,
        body: input.body,
        data: input.data,
        status: NotificationStatus.PENDING,
      },
    });
    return toRecord(row);
  }

  async listPending(userId: string, limit: number): Promise<InboxRecord[]> {
    return this.listByStatus(userId, limit, [NotificationStatus.PENDING]);
  }

  async listUnacked(userId: string, limit: number): Promise<InboxRecord[]> {
    return this.listByStatus(userId, limit, [
      NotificationStatus.PENDING,
      NotificationStatus.SENT,
    ]);
  }

  private async listByStatus(
    userId: string,
    limit: number,
    statuses: NotificationStatus[],
  ): Promise<InboxRecord[]> {
    const cutoff = new Date(Date.now() - PENDING_MAX_AGE_MS);
    const rows = await this.prisma.db.notification.findMany({
      where: {
        userId,
        status: { in: statuses },
        createdAt: { gte: cutoff },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    return rows.map(toRecord);
  }

  async markSent(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    await this.prisma.db.notification.updateMany({
      where: { id: { in: ids }, status: NotificationStatus.PENDING },
      data: { status: NotificationStatus.SENT },
    });
  }

  async markDelivered(userId: string, ids: string[]): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }
    const result = await this.prisma.db.notification.updateMany({
      where: {
        userId,
        id: { in: ids },
        status: { in: [NotificationStatus.PENDING, NotificationStatus.SENT] },
      },
      data: { status: NotificationStatus.DELIVERED },
    });
    return result.count;
  }
}

@Injectable()
export class MemoryInboxStore implements InboxStore {
  readonly rows: InboxRecord[] = [];

  enqueue(input: EnqueueInput): Promise<InboxRecord> {
    const row: InboxRecord = {
      id: randomUUID(),
      userId: input.userId,
      title: input.title,
      body: input.body,
      data: { ...input.data },
      status: 'PENDING',
      createdAt: new Date(),
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  listPending(userId: string, limit: number): Promise<InboxRecord[]> {
    return Promise.resolve(this.filterInbox(userId, limit, ['PENDING']));
  }

  listUnacked(userId: string, limit: number): Promise<InboxRecord[]> {
    return Promise.resolve(
      this.filterInbox(userId, limit, ['PENDING', 'SENT']),
    );
  }

  private filterInbox(
    userId: string,
    limit: number,
    statuses: InboxStatus[],
  ): InboxRecord[] {
    const cutoff = Date.now() - PENDING_MAX_AGE_MS;
    const allowed = new Set(statuses);
    const rows = this.rows.filter(
      (row) =>
        row.userId === userId &&
        allowed.has(row.status) &&
        row.createdAt.getTime() >= cutoff,
    );
    rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return rows.slice(0, limit);
  }

  markSent(ids: string[]): Promise<void> {
    const set = new Set(ids);
    for (const row of this.rows) {
      if (set.has(row.id) && row.status === 'PENDING') {
        row.status = 'SENT';
      }
    }
    return Promise.resolve();
  }

  markDelivered(userId: string, ids: string[]): Promise<number> {
    const set = new Set(ids);
    let count = 0;
    for (const row of this.rows) {
      if (
        row.userId === userId &&
        set.has(row.id) &&
        (row.status === 'PENDING' || row.status === 'SENT')
      ) {
        row.status = 'DELIVERED';
        count += 1;
      }
    }
    return Promise.resolve(count);
  }
}

function toRecord(row: {
  id: string;
  userId: string;
  title: string;
  body: string;
  data: Prisma.JsonValue;
  status: InboxStatus;
  createdAt: Date;
}): InboxRecord {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    body: row.body,
    data: asStringMap(row.data),
    status: row.status,
    createdAt: row.createdAt,
  };
}

function asStringMap(value: Prisma.JsonValue): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (typeof nested === 'string') {
      out[key] = nested;
    }
  }
  return out;
}
