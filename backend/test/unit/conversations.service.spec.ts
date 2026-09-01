import { randomUUID } from 'node:crypto';
import { ConversationsService } from '../../src/comunidad/conversations.service';
import { MemoryConversationsStore } from '../../src/comunidad/conversations.store';
import { MemoryPostsStore } from '../../src/comunidad/posts.store';
import type { NotificationPayload } from '../../src/notifications/notifications.service';
import { NotificationService } from '../../src/notifications/notifications.service';
import { encodeCursor } from '../../src/shared/pagination/cursor';

type SentPush = { userId: string } & NotificationPayload;

function fakeNotifications(): {
  service: NotificationService;
  sent: SentPush[];
} {
  const sent: SentPush[] = [];
  const service = {
    send: (userId: string, payload: NotificationPayload) => {
      sent.push({ userId, ...payload });
      return Promise.resolve({ id: randomUUID(), status: 'pending' as const });
    },
  } as unknown as NotificationService;
  return { service, sent };
}

describe('ConversationsService', () => {
  it('starts a 1:1 thread from a post and is idempotent', async () => {
    const posts = new MemoryPostsStore();
    const conversations = new MemoryConversationsStore();
    const { service: notifications, sent } = fakeNotifications();
    const authorId = randomUUID();
    const buyerId = randomUUID();
    const post = await posts.create({
      authorId,
      title: 'Papa criolla',
      description: '50 kg',
      category: 'papa',
    });
    const svc = new ConversationsService(conversations, posts, notifications);

    const first = await svc.start(buyerId, post.id);
    expect(first.created).toBe(true);
    expect(first.conversation.peerId).toBe(authorId);
    expect(first.conversation.initiatorId).toBe(buyerId);

    const again = await svc.start(buyerId, post.id);
    expect(again.created).toBe(false);
    expect(again.conversation.id).toBe(first.conversation.id);
    expect(sent).toHaveLength(0);
  });

  it('rejects starting a thread on your own post', async () => {
    const posts = new MemoryPostsStore();
    const conversations = new MemoryConversationsStore();
    const { service: notifications } = fakeNotifications();
    const authorId = randomUUID();
    const post = await posts.create({
      authorId,
      title: 'Papa',
      description: 'Lote',
      category: 'papa',
    });
    const svc = new ConversationsService(conversations, posts, notifications);
    await expect(svc.start(authorId, post.id)).rejects.toThrow(
      'Cannot start a conversation with yourself',
    );
  });

  it('persists messages, pages newest first, and pushes the other party', async () => {
    const posts = new MemoryPostsStore();
    const conversations = new MemoryConversationsStore();
    const { service: notifications, sent } = fakeNotifications();
    const authorId = randomUUID();
    const buyerId = randomUUID();
    const post = await posts.create({
      authorId,
      title: 'Papa',
      description: 'Lote',
      category: 'papa',
    });
    const svc = new ConversationsService(conversations, posts, notifications);
    const thread = await svc.start(buyerId, post.id);

    const first = await svc.sendMessage(
      buyerId,
      thread.conversation.id,
      '¿A 2500 el kilo?',
    );
    const second = await svc.sendMessage(
      authorId,
      thread.conversation.id,
      'Puedo a 2400, entrega en Siachoque',
    );
    expect(first.body).toBe('¿A 2500 el kilo?');
    expect(conversations.messages).toHaveLength(2);

    expect(sent).toHaveLength(2);
    expect(sent[0]?.userId).toBe(authorId);
    expect(sent[0]?.data?.conversationId).toBe(thread.conversation.id);
    expect(sent[1]?.userId).toBe(buyerId);

    const page = await svc.listMessages(buyerId, thread.conversation.id, 1);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.id).toBe(second.id);
    expect(page.nextCursor).toBeTruthy();

    const older = await svc.listMessages(
      authorId,
      thread.conversation.id,
      10,
      page.nextCursor ?? undefined,
    );
    expect(older.items.map((item) => item.id)).toEqual([first.id]);
    expect(older.nextCursor).toBeNull();
  });

  it('hides the thread from a third user', async () => {
    const posts = new MemoryPostsStore();
    const conversations = new MemoryConversationsStore();
    const { service: notifications } = fakeNotifications();
    const authorId = randomUUID();
    const buyerId = randomUUID();
    const post = await posts.create({
      authorId,
      title: 'Papa',
      description: 'Lote',
      category: 'papa',
    });
    const svc = new ConversationsService(conversations, posts, notifications);
    const thread = await svc.start(buyerId, post.id);
    await expect(
      svc.listMessages(randomUUID(), thread.conversation.id, 20),
    ).rejects.toThrow('Not found');
    await expect(
      svc.sendMessage(randomUUID(), thread.conversation.id, 'hola'),
    ).rejects.toThrow('Not found');
  });

  it('rejects an invalid cursor', async () => {
    const posts = new MemoryPostsStore();
    const conversations = new MemoryConversationsStore();
    const { service: notifications } = fakeNotifications();
    const authorId = randomUUID();
    const buyerId = randomUUID();
    const post = await posts.create({
      authorId,
      title: 'Papa',
      description: 'Lote',
      category: 'papa',
    });
    const svc = new ConversationsService(conversations, posts, notifications);
    const thread = await svc.start(buyerId, post.id);
    await expect(
      svc.listMessages(buyerId, thread.conversation.id, 20, 'not-a-cursor'),
    ).rejects.toThrow('Invalid cursor');
    const ok = encodeCursor({ id: randomUUID(), t: Date.now() });
    const empty = await svc.listMessages(
      buyerId,
      thread.conversation.id,
      20,
      ok,
    );
    expect(empty.items).toEqual([]);
  });

  it('returns 404 when the post does not exist', async () => {
    const posts = new MemoryPostsStore();
    const conversations = new MemoryConversationsStore();
    const { service: notifications } = fakeNotifications();
    const svc = new ConversationsService(conversations, posts, notifications);
    await expect(svc.start(randomUUID(), randomUUID())).rejects.toThrow(
      'Not found',
    );
  });

  it('returns the existing thread if create races the unique key', async () => {
    const posts = new MemoryPostsStore();
    const conversations = new MemoryConversationsStore();
    const { service: notifications } = fakeNotifications();
    const authorId = randomUUID();
    const buyerId = randomUUID();
    const post = await posts.create({
      authorId,
      title: 'Papa',
      description: 'Lote',
      category: 'papa',
    });
    const seeded = await conversations.create({
      postId: post.id,
      initiatorId: buyerId,
      peerId: authorId,
    });
    jest
      .spyOn(conversations, 'findByPostAndInitiator')
      .mockResolvedValueOnce(null)
      .mockResolvedValue(seeded);
    const svc = new ConversationsService(conversations, posts, notifications);

    const raced = await svc.start(buyerId, post.id);
    expect(raced.created).toBe(false);
    expect(raced.conversation.id).toBe(seeded.id);
    expect(conversations.conversations).toHaveLength(1);
  });

  it('truncates the FCM preview to 80 chars', async () => {
    const posts = new MemoryPostsStore();
    const conversations = new MemoryConversationsStore();
    const { service: notifications, sent } = fakeNotifications();
    const authorId = randomUUID();
    const buyerId = randomUUID();
    const post = await posts.create({
      authorId,
      title: 'Papa',
      description: 'Lote',
      category: 'papa',
    });
    const svc = new ConversationsService(conversations, posts, notifications);
    const thread = await svc.start(buyerId, post.id);
    const long = 'a'.repeat(81);
    await svc.sendMessage(buyerId, thread.conversation.id, long);
    expect(sent[0]?.body).toBe(`${'a'.repeat(79)}…`);
    expect(sent[0]?.body?.length).toBe(80);
  });
});
