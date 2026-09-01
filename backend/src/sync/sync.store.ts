import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { SyncEntity, SyncOpStatus } from './sync.constants';

export const SYNC_STORE = Symbol('SYNC_STORE');

export type StoredSyncOp = {
  opId: string;
  userId: string;
  entity: string;
  entityId: string;
  status: SyncOpStatus;
  reason?: string;
  record: unknown;
};

export type PersistSyncOpInput = {
  opId: string;
  userId: string;
  entity: SyncEntity;
  entityId: string;
  status: SyncOpStatus;
  reason?: string;
  record: unknown;
};

export interface SyncStore {
  findOp(opId: string): Promise<StoredSyncOp | null>;
  saveOp(input: PersistSyncOpInput): Promise<void>;
  getClock(entity: SyncEntity, entityKey: string): Promise<Date | null>;
  setClock(
    entity: SyncEntity,
    entityKey: string,
    lastWriteAt: Date,
    lastOpId: string,
    userId: string,
  ): Promise<void>;
}

@Injectable()
export class PrismaSyncStore implements SyncStore {
  constructor(private readonly prisma: PrismaService) {}

  async findOp(opId: string): Promise<StoredSyncOp | null> {
    const row = await this.prisma.db.syncOp.findUnique({ where: { opId } });
    return row ? toStored(row) : null;
  }

  async saveOp(input: PersistSyncOpInput): Promise<void> {
    await this.prisma.db.syncOp.create({
      data: {
        opId: input.opId,
        userId: input.userId,
        entity: input.entity,
        entityId: input.entityId,
        status: input.status,
        reason: input.reason,
        record: input.record ?? Prisma.JsonNull,
      },
    });
  }

  async getClock(entity: SyncEntity, entityKey: string): Promise<Date | null> {
    const row = await this.prisma.db.syncClock.findUnique({
      where: { entity_entityKey: { entity, entityKey } },
    });
    return row?.lastWriteAt ?? null;
  }

  async setClock(
    entity: SyncEntity,
    entityKey: string,
    lastWriteAt: Date,
    lastOpId: string,
    userId: string,
  ): Promise<void> {
    await this.prisma.db.syncClock.upsert({
      where: { entity_entityKey: { entity, entityKey } },
      create: { entity, entityKey, lastWriteAt, lastOpId, userId },
      update: { lastWriteAt, lastOpId, userId },
    });
  }
}

@Injectable()
export class MemorySyncStore implements SyncStore {
  readonly ops = new Map<string, StoredSyncOp>();
  readonly clocks = new Map<string, Date>();

  findOp(opId: string): Promise<StoredSyncOp | null> {
    return Promise.resolve(this.ops.get(opId) ?? null);
  }

  saveOp(input: PersistSyncOpInput): Promise<void> {
    this.ops.set(input.opId, {
      opId: input.opId,
      userId: input.userId,
      entity: input.entity,
      entityId: input.entityId,
      status: input.status,
      reason: input.reason,
      record: input.record,
    });
    return Promise.resolve();
  }

  getClock(entity: SyncEntity, entityKey: string): Promise<Date | null> {
    return Promise.resolve(
      this.clocks.get(clockKey(entity, entityKey)) ?? null,
    );
  }

  setClock(
    entity: SyncEntity,
    entityKey: string,
    lastWriteAt: Date,
    lastOpId: string,
    userId: string,
  ): Promise<void> {
    void lastOpId;
    void userId;
    this.clocks.set(clockKey(entity, entityKey), lastWriteAt);
    return Promise.resolve();
  }
}

function clockKey(entity: string, entityKey: string): string {
  return `${entity}\0${entityKey}`;
}

function toStored(row: {
  opId: string;
  userId: string;
  entity: string;
  entityId: string;
  status: string;
  reason: string | null;
  record: unknown;
}): StoredSyncOp {
  return {
    opId: row.opId,
    userId: row.userId,
    entity: row.entity,
    entityId: row.entityId,
    status: row.status as SyncOpStatus,
    reason: row.reason ?? undefined,
    record: row.record,
  };
}
