import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { PaymentChannel } from './suscripciones.constants';

export type SubscriptionRecord = {
  userId: string;
  currentPeriodEnd: Date;
  remindedExpiryAt: Date | null;
  remindedGraceAt: Date | null;
  remindedHiddenAt: Date | null;
};

export type PaymentRecord = {
  id: string;
  actorId: string;
  targetUserId: string;
  channel: PaymentChannel;
  reference: string | null;
  periodEndAfter: Date;
  createdAt: Date;
};

export type UpsertSubscriptionInput = {
  userId: string;
  currentPeriodEnd: Date;
  remindedExpiryAt: Date | null;
  remindedGraceAt: Date | null;
  remindedHiddenAt: Date | null;
};

export type RecordPaymentInput = {
  actorId: string;
  targetUserId: string;
  channel: PaymentChannel;
  reference: string | null;
  periodEndAfter: Date;
};

export const SUBSCRIPTIONS_STORE = Symbol('SUBSCRIPTIONS_STORE');

export interface SubscriptionsStore {
  findByUserId(userId: string): Promise<SubscriptionRecord | null>;
  listAll(): Promise<SubscriptionRecord[]>;
  upsert(input: UpsertSubscriptionInput): Promise<SubscriptionRecord>;
  getPeriodEnd(userId: string): Date | null;
  findPayment(
    targetUserId: string,
    channel: PaymentChannel,
    reference: string,
  ): Promise<PaymentRecord | null>;
  insertPayment(input: RecordPaymentInput): Promise<PaymentRecord>;
}

@Injectable()
export class PrismaSubscriptionsStore implements SubscriptionsStore {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<SubscriptionRecord | null> {
    const row = await this.prisma.db.subscription.findUnique({
      where: { userId },
    });
    return row ? toSubscription(row) : null;
  }

  async listAll(): Promise<SubscriptionRecord[]> {
    const rows = await this.prisma.db.subscription.findMany();
    return rows.map(toSubscription);
  }

  getPeriodEnd(userId: string): Date | null {
    void userId;
    throw new Error('Prisma listing uses SQL JOIN, not getPeriodEnd');
  }

  async upsert(input: UpsertSubscriptionInput): Promise<SubscriptionRecord> {
    const row = await this.prisma.db.subscription.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        currentPeriodEnd: input.currentPeriodEnd,
        remindedExpiryAt: input.remindedExpiryAt,
        remindedGraceAt: input.remindedGraceAt,
        remindedHiddenAt: input.remindedHiddenAt,
      },
      update: {
        currentPeriodEnd: input.currentPeriodEnd,
        remindedExpiryAt: input.remindedExpiryAt,
        remindedGraceAt: input.remindedGraceAt,
        remindedHiddenAt: input.remindedHiddenAt,
      },
    });
    return toSubscription(row);
  }

  async findPayment(
    targetUserId: string,
    channel: PaymentChannel,
    reference: string,
  ): Promise<PaymentRecord | null> {
    const row = await this.prisma.db.subscriptionPayment.findUnique({
      where: {
        targetUserId_channel_reference: {
          targetUserId,
          channel,
          reference,
        },
      },
    });
    return row ? toPayment(row) : null;
  }

  async insertPayment(input: RecordPaymentInput): Promise<PaymentRecord> {
    const row = await this.prisma.db.subscriptionPayment.create({
      data: {
        id: randomUUID(),
        actorId: input.actorId,
        targetUserId: input.targetUserId,
        channel: input.channel,
        reference: input.reference,
        periodEndAfter: input.periodEndAfter,
      },
    });
    return toPayment(row);
  }
}

@Injectable()
export class MemorySubscriptionsStore implements SubscriptionsStore {
  readonly byUserId = new Map<string, SubscriptionRecord>();
  readonly payments: PaymentRecord[] = [];

  findByUserId(userId: string): Promise<SubscriptionRecord | null> {
    return Promise.resolve(cloneSub(this.byUserId.get(userId) ?? null));
  }

  listAll(): Promise<SubscriptionRecord[]> {
    return Promise.resolve([...this.byUserId.values()].map(cloneSubRequired));
  }

  getPeriodEnd(userId: string): Date | null {
    const row = this.byUserId.get(userId);
    return row ? new Date(row.currentPeriodEnd) : null;
  }

  upsert(input: UpsertSubscriptionInput): Promise<SubscriptionRecord> {
    const row: SubscriptionRecord = {
      userId: input.userId,
      currentPeriodEnd: new Date(input.currentPeriodEnd),
      remindedExpiryAt: input.remindedExpiryAt
        ? new Date(input.remindedExpiryAt)
        : null,
      remindedGraceAt: input.remindedGraceAt
        ? new Date(input.remindedGraceAt)
        : null,
      remindedHiddenAt: input.remindedHiddenAt
        ? new Date(input.remindedHiddenAt)
        : null,
    };
    this.byUserId.set(input.userId, row);
    return Promise.resolve(cloneSubRequired(row));
  }

  findPayment(
    targetUserId: string,
    channel: PaymentChannel,
    reference: string,
  ): Promise<PaymentRecord | null> {
    const row = this.payments.find(
      (item) =>
        item.targetUserId === targetUserId &&
        item.channel === channel &&
        item.reference === reference,
    );
    return Promise.resolve(row ? { ...row } : null);
  }

  insertPayment(input: RecordPaymentInput): Promise<PaymentRecord> {
    if (input.reference) {
      const dup = this.payments.find(
        (item) =>
          item.targetUserId === input.targetUserId &&
          item.channel === input.channel &&
          item.reference === input.reference,
      );
      if (dup) {
        const err = Object.assign(new Error('Unique constraint failed'), {
          code: 'P2002',
        });
        return Promise.reject(err);
      }
    }
    const row: PaymentRecord = {
      id: randomUUID(),
      actorId: input.actorId,
      targetUserId: input.targetUserId,
      channel: input.channel,
      reference: input.reference,
      periodEndAfter: new Date(input.periodEndAfter),
      createdAt: new Date(),
    };
    this.payments.push(row);
    return Promise.resolve({ ...row });
  }
}

function toSubscription(row: {
  userId: string;
  currentPeriodEnd: Date;
  remindedExpiryAt: Date | null;
  remindedGraceAt: Date | null;
  remindedHiddenAt: Date | null;
}): SubscriptionRecord {
  return {
    userId: row.userId,
    currentPeriodEnd: row.currentPeriodEnd,
    remindedExpiryAt: row.remindedExpiryAt,
    remindedGraceAt: row.remindedGraceAt,
    remindedHiddenAt: row.remindedHiddenAt,
  };
}

function toPayment(row: {
  id: string;
  actorId: string;
  targetUserId: string;
  channel: string;
  reference: string | null;
  periodEndAfter: Date;
  createdAt: Date;
}): PaymentRecord {
  return {
    id: row.id,
    actorId: row.actorId,
    targetUserId: row.targetUserId,
    channel: row.channel as PaymentChannel,
    reference: row.reference,
    periodEndAfter: row.periodEndAfter,
    createdAt: row.createdAt,
  };
}

function cloneSub(row: SubscriptionRecord | null): SubscriptionRecord | null {
  return row ? cloneSubRequired(row) : null;
}

function cloneSubRequired(row: SubscriptionRecord): SubscriptionRecord {
  return {
    userId: row.userId,
    currentPeriodEnd: new Date(row.currentPeriodEnd),
    remindedExpiryAt: row.remindedExpiryAt
      ? new Date(row.remindedExpiryAt)
      : null,
    remindedGraceAt: row.remindedGraceAt ? new Date(row.remindedGraceAt) : null,
    remindedHiddenAt: row.remindedHiddenAt
      ? new Date(row.remindedHiddenAt)
      : null,
  };
}
