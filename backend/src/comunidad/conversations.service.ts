import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationService } from '../notifications/notifications.service';
import { decodeCursor, paginate } from '../shared/pagination/cursor';
import type { Paginated } from '../shared/pagination/cursor';
import {
  CONVERSATIONS_STORE,
  UniqueConversationError,
  type ConversationRecord,
  type ConversationsStore,
  type MessageRecord,
} from './conversations.store';
import { MESSAGE_PUSH_PREVIEW_MAX } from './messaging.constants';
import { POSTS_STORE } from './posts.store';
import type { PostsStore } from './posts.store';

export type ConversationView = {
  id: string;
  postId: string;
  initiatorId: string;
  peerId: string;
  createdAt: string;
};

export type MessageView = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
};

export type StartConversationResult = {
  conversation: ConversationView;
  created: boolean;
};

@Injectable()
export class ConversationsService {
  constructor(
    @Inject(CONVERSATIONS_STORE)
    private readonly conversations: ConversationsStore,
    @Inject(POSTS_STORE) private readonly posts: PostsStore,
    private readonly notifications: NotificationService,
  ) {}

  async start(
    initiatorId: string,
    postId: string,
  ): Promise<StartConversationResult> {
    const post = await this.posts.findById(postId);
    if (!post) {
      throw new NotFoundException('Not found');
    }
    if (post.authorId === initiatorId) {
      throw new BadRequestException(
        'Cannot start a conversation with yourself',
      );
    }
    const existing = await this.conversations.findByPostAndInitiator(
      postId,
      initiatorId,
    );
    if (existing) {
      return { conversation: toConversationView(existing), created: false };
    }
    try {
      const row = await this.conversations.create({
        postId,
        initiatorId,
        peerId: post.authorId,
      });
      return { conversation: toConversationView(row), created: true };
    } catch (err) {
      if (!(err instanceof UniqueConversationError)) {
        throw err;
      }
      const raced = await this.conversations.findByPostAndInitiator(
        postId,
        initiatorId,
      );
      if (!raced) {
        throw err;
      }
      return { conversation: toConversationView(raced), created: false };
    }
  }

  async sendMessage(
    userId: string,
    conversationId: string,
    body: string,
  ): Promise<MessageView> {
    const conversation = await this.requireParticipant(conversationId, userId);
    const row = await this.conversations.addMessage({
      conversationId,
      senderId: userId,
      body,
    });
    const recipientId =
      conversation.initiatorId === userId
        ? conversation.peerId
        : conversation.initiatorId;
    await this.notifications.send(recipientId, {
      title: 'Nuevo mensaje',
      body: preview(body),
      data: {
        conversationId,
        messageId: row.id,
        postId: conversation.postId,
      },
    });
    return toMessageView(row);
  }

  async listMessages(
    userId: string,
    conversationId: string,
    limit: number,
    cursor?: string,
  ): Promise<Paginated<MessageView>> {
    await this.requireParticipant(conversationId, userId);
    const decoded = cursor ? decodeCursor(cursor) : undefined;
    const rows = await this.conversations.listMessages(
      conversationId,
      limit,
      decoded,
    );
    const page = paginate(rows, limit);
    return {
      items: page.items.map(toMessageView),
      nextCursor: page.nextCursor,
    };
  }

  private async requireParticipant(
    conversationId: string,
    userId: string,
  ): Promise<ConversationRecord> {
    const row = await this.conversations.findById(conversationId);
    if (!row || !isParticipant(row, userId)) {
      throw new NotFoundException('Not found');
    }
    return row;
  }
}

function isParticipant(row: ConversationRecord, userId: string): boolean {
  return row.initiatorId === userId || row.peerId === userId;
}

function toConversationView(row: ConversationRecord): ConversationView {
  return {
    id: row.id,
    postId: row.postId,
    initiatorId: row.initiatorId,
    peerId: row.peerId,
    createdAt: row.createdAt.toISOString(),
  };
}

function toMessageView(row: MessageRecord): MessageView {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

function preview(body: string): string {
  const compact = body.replace(/\s+/g, ' ').trim();
  if (compact.length <= MESSAGE_PUSH_PREVIEW_MAX) {
    return compact;
  }
  return `${compact.slice(0, MESSAGE_PUSH_PREVIEW_MAX - 1)}…`;
}
