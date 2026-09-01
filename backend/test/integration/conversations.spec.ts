import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  PrismaConversationsStore,
  UniqueConversationError,
} from '../../src/comunidad/conversations.store';
import { PrismaService } from '../../src/prisma/prisma.service';

const AUTHOR_ID = '00000000-0000-4000-8000-000000000022';
const BUYER_ID = '00000000-0000-4000-8000-000000000122';

function shouldRun(): boolean {
  const url = process.env.DATABASE_URL ?? '';
  return (
    url.includes('ci:ci@127.0.0.1') || process.env.CONVERSATIONS_PG === '1'
  );
}

const describePg = shouldRun() ? describe : describe.skip;

describePg('Conversations on Postgres (AG-22)', () => {
  const prisma = new PrismaClient();
  const store = new PrismaConversationsStore({
    db: prisma,
  } as unknown as PrismaService);
  let postId = '';

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.$executeRaw`
      INSERT INTO users (
        id, role, phone_enc, phone_hash, verified, created_at, updated_at
      )
      VALUES (
        ${AUTHOR_ID}::uuid,
        'NATURAL'::"Role",
        decode('00', 'hex'),
        ${'conv-author-phone-hash'},
        true,
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `;
    await prisma.$executeRaw`
      INSERT INTO users (
        id, role, phone_enc, phone_hash, verified, created_at, updated_at
      )
      VALUES (
        ${BUYER_ID}::uuid,
        'NATURAL'::"Role",
        decode('00', 'hex'),
        ${'conv-buyer-phone-hash'},
        true,
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `;
    await prisma.$executeRaw`DELETE FROM posts WHERE author_id = ${AUTHOR_ID}::uuid`;
    postId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO posts (
        id, author_id, title, description, category, created_at, updated_at
      )
      VALUES (
        ${postId}::uuid,
        ${AUTHOR_ID}::uuid,
        'Papa criolla',
        'Cosecha de Siachoque',
        'papa',
        NOW(),
        NOW()
      )
    `;
  });

  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM posts WHERE author_id = ${AUTHOR_ID}::uuid`;
    await prisma.$executeRaw`DELETE FROM users WHERE id = ${BUYER_ID}::uuid`;
    await prisma.$executeRaw`DELETE FROM users WHERE id = ${AUTHOR_ID}::uuid`;
    await prisma.$disconnect();
  });

  it('enforces unique (post, initiator) and pages messages newest first', async () => {
    const first = await store.create({
      postId,
      initiatorId: BUYER_ID,
      peerId: AUTHOR_ID,
    });
    await expect(
      store.create({
        postId,
        initiatorId: BUYER_ID,
        peerId: AUTHOR_ID,
      }),
    ).rejects.toBeInstanceOf(UniqueConversationError);
    const found = await store.findByPostAndInitiator(postId, BUYER_ID);
    expect(found?.id).toBe(first.id);

    const older = await store.addMessage({
      conversationId: first.id,
      senderId: BUYER_ID,
      body: '¿A 2500 el kilo?',
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const newer = await store.addMessage({
      conversationId: first.id,
      senderId: AUTHOR_ID,
      body: 'Puedo a 2400',
    });
    const page = await store.listMessages(first.id, 1);
    expect(page).toHaveLength(2);
    const newest = page[0];
    expect(newest?.id).toBe(newer.id);
    expect(newest).toBeDefined();
    if (!newest) {
      throw new Error('expected newest message');
    }
    const olderPage = await store.listMessages(first.id, 10, {
      id: newest.id,
      t: newest.t,
    });
    expect(olderPage.map((row) => row.id)).toEqual([older.id]);
  });
});
