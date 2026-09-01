import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CursorPayload } from '../shared/pagination/cursor';

export const CONVERSATIONS_STORE = Symbol('CONVERSATIONS_STORE');

/** Duplicate (postId, initiatorId). Service maps this to HTTP 200. */
export class UniqueConversationError extends Error {
  constructor() {
    super('Conversation already exists');
    this.name = 'UniqueConversationError';
  }
}

export type ConversationRecord = {
  id: string;
  postId: string;
  initiatorId: string;
  peerId: string;
  createdAt: Date;
};

export type MessageRecord = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: Date;
  t: number;
};

export type CreateConversationInput = {
  id?: string;
  postId: string;
  initiatorId: string;
  peerId: string;
};

export type CreateMessageInput = {
  id?: string;
  conversationId: string;
  senderId: string;
  body: string;
};

export interface ConversationsStore {
  create(input: CreateConversationInput): Promise<ConversationRecord>;
  findByPostAndInitiator(
    postId: string,
    initiatorId: string,
  ): Promise<ConversationRecord | null>;
  findById(id: string): Promise<ConversationRecord | null>;
  findMessageById(id: string): Promise<MessageRecord | null>;
  addMessage(input: CreateMessageInput): Promise<MessageRecord>;
  listForParticipantSince(
    userId: string,
    since: Date,
    limit: number,
  ): Promise<ConversationRecord[]>;
  listMessagesForParticipantSince(
    userId: string,
    since: Date,
    limit: number,
  ): Promise<MessageRecord[]>;
  listMessages(
    conversationId: string,
    limit: number,
    cursor?: CursorPayload,
  ): Promise<MessageRecord[]>;
}

@Injectable()
export class PrismaConversationsStore implements ConversationsStore {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateConversationInput): Promise<ConversationRecord> {
    try {
      const row = await this.prisma.db.conversation.create({
        data: {
          id: input.id ?? randomUUID(),
          postId: input.postId,
          initiatorId: input.initiatorId,
          peerId: input.peerId,
        },
      });
      return toConversation(row);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new UniqueConversationError();
      }
      throw err;
    }
  }

  async findByPostAndInitiator(
    postId: string,
    initiatorId: string,
  ): Promise<ConversationRecord | null> {
    const row = await this.prisma.db.conversation.findUnique({
      where: {
        postId_initiatorId: { postId, initiatorId },
      },
    });
    return row ? toConversation(row) : null;
  }

  async findById(id: string): Promise<ConversationRecord | null> {
    const row = await this.prisma.db.conversation.findUnique({ where: { id } });
    return row ? toConversation(row) : null;
  }

  async findMessageById(id: string): Promise<MessageRecord | null> {
    const row = await this.prisma.db.message.findUnique({ where: { id } });
    return row ? toMessage(row) : null;
  }

  async addMessage(input: CreateMessageInput): Promise<MessageRecord> {
    const row = await this.prisma.db.message.create({
      data: {
        id: input.id ?? randomUUID(),
        conversationId: input.conversationId,
        senderId: input.senderId,
        body: input.body,
      },
    });
    return toMessage(row);
  }

  async listForParticipantSince(
    userId: string,
    since: Date,
    limit: number,
  ): Promise<ConversationRecord[]> {
    const rows = await this.prisma.db.conversation.findMany({
      where: {
        OR: [{ initiatorId: userId }, { peerId: userId }],
        createdAt: { gt: since },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    return rows.map(toConversation);
  }

  async listMessagesForParticipantSince(
    userId: string,
    since: Date,
    limit: number,
  ): Promise<MessageRecord[]> {
    const rows = await this.prisma.db.message.findMany({
      where: {
        createdAt: { gt: since },
        conversation: {
          OR: [{ initiatorId: userId }, { peerId: userId }],
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    return rows.map(toMessage);
  }

  async listMessages(
    conversationId: string,
    limit: number,
    cursor?: CursorPayload,
  ): Promise<MessageRecord[]> {
    const take = limit + 1;
    const rows = await this.prisma.db.message.findMany({
      where: {
        conversationId,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: new Date(cursor.t) } },
                {
                  AND: [
                    { createdAt: new Date(cursor.t) },
                    { id: { lt: cursor.id } },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
    });
    return rows.map(toMessage);
  }
}

@Injectable()
export class MemoryConversationsStore implements ConversationsStore {
  readonly conversations: ConversationRecord[] = [];
  readonly messages: MessageRecord[] = [];

  create(input: CreateConversationInput): Promise<ConversationRecord> {
    const duplicate = this.conversations.find(
      (row) =>
        row.postId === input.postId && row.initiatorId === input.initiatorId,
    );
    if (duplicate) {
      return Promise.reject(new UniqueConversationError());
    }
    const row: ConversationRecord = {
      id: input.id ?? randomUUID(),
      postId: input.postId,
      initiatorId: input.initiatorId,
      peerId: input.peerId,
      createdAt: new Date(),
    };
    this.conversations.push(row);
    return Promise.resolve(row);
  }

  findByPostAndInitiator(
    postId: string,
    initiatorId: string,
  ): Promise<ConversationRecord | null> {
    return Promise.resolve(
      this.conversations.find(
        (row) => row.postId === postId && row.initiatorId === initiatorId,
      ) ?? null,
    );
  }

  findById(id: string): Promise<ConversationRecord | null> {
    return Promise.resolve(
      this.conversations.find((row) => row.id === id) ?? null,
    );
  }

  findMessageById(id: string): Promise<MessageRecord | null> {
    return Promise.resolve(this.messages.find((row) => row.id === id) ?? null);
  }

  addMessage(input: CreateMessageInput): Promise<MessageRecord> {
    const createdAt = new Date();
    const last = this.messages[this.messages.length - 1];
    if (last && last.t >= createdAt.getTime()) {
      createdAt.setTime(last.t + 1);
    }
    const row: MessageRecord = {
      id: input.id ?? randomUUID(),
      conversationId: input.conversationId,
      senderId: input.senderId,
      body: input.body,
      createdAt,
      t: createdAt.getTime(),
    };
    this.messages.push(row);
    return Promise.resolve(row);
  }

  listForParticipantSince(
    userId: string,
    since: Date,
    limit: number,
  ): Promise<ConversationRecord[]> {
    const sinceMs = since.getTime();
    const rows = this.conversations
      .filter(
        (row) =>
          (row.initiatorId === userId || row.peerId === userId) &&
          row.createdAt.getTime() > sinceMs,
      )
      .sort((left, right) => {
        const delta = left.createdAt.getTime() - right.createdAt.getTime();
        if (delta !== 0) {
          return delta;
        }
        return left.id.localeCompare(right.id);
      })
      .slice(0, limit);
    return Promise.resolve(rows);
  }

  listMessagesForParticipantSince(
    userId: string,
    since: Date,
    limit: number,
  ): Promise<MessageRecord[]> {
    const sinceMs = since.getTime();
    const mine = new Set(
      this.conversations
        .filter((row) => row.initiatorId === userId || row.peerId === userId)
        .map((row) => row.id),
    );
    const rows = this.messages
      .filter(
        (row) =>
          mine.has(row.conversationId) && row.createdAt.getTime() > sinceMs,
      )
      .sort((left, right) => {
        const delta = left.createdAt.getTime() - right.createdAt.getTime();
        if (delta !== 0) {
          return delta;
        }
        return left.id.localeCompare(right.id);
      })
      .slice(0, limit);
    return Promise.resolve(rows);
  }

  listMessages(
    conversationId: string,
    limit: number,
    cursor?: CursorPayload,
  ): Promise<MessageRecord[]> {
    const take = limit + 1;
    const rows = this.messages
      .filter((row) => row.conversationId === conversationId)
      .filter((row) => {
        if (!cursor) {
          return true;
        }
        if (row.t < cursor.t) {
          return true;
        }
        return row.t === cursor.t && row.id < cursor.id;
      })
      .sort((left, right) => {
        if (right.t !== left.t) {
          return right.t - left.t;
        }
        return right.id.localeCompare(left.id);
      })
      .slice(0, take);
    return Promise.resolve(rows);
  }
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object' || !('code' in err)) {
    return false;
  }
  const code = (err as { code?: string }).code;
  if (code === 'P2002' || code === '23505') {
    return true;
  }
  if (code === 'P2010') {
    const meta = (err as { meta?: { code?: string } }).meta;
    return meta?.code === '23505';
  }
  return false;
}

function toConversation(row: {
  id: string;
  postId: string;
  initiatorId: string;
  peerId: string;
  createdAt: Date;
}): ConversationRecord {
  return {
    id: row.id,
    postId: row.postId,
    initiatorId: row.initiatorId,
    peerId: row.peerId,
    createdAt: row.createdAt,
  };
}

function toMessage(row: {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: Date;
}): MessageRecord {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    body: row.body,
    createdAt: row.createdAt,
    t: row.createdAt.getTime(),
  };
}
