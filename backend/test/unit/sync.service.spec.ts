import { randomUUID } from 'node:crypto';
import { MemoryWeatherAlertStore } from '../../src/clima/alerts.store';
import { ClimaService } from '../../src/clima/clima.service';
import { normalizeMunicipio } from '../../src/clima/municipio';
import { CommoditiesService } from '../../src/commodities/commodities.service';
import { MemoryPricesStore } from '../../src/commodities/prices.store';
import { ConversationsService } from '../../src/comunidad/conversations.service';
import { MemoryConversationsStore } from '../../src/comunidad/conversations.store';
import { PostsService } from '../../src/comunidad/posts.service';
import { MemoryPostsStore } from '../../src/comunidad/posts.store';
import { ProfilesService } from '../../src/comunidad/profiles.service';
import { MemoryProfilesStore } from '../../src/comunidad/profiles.store';
import type {
  AuthUser,
  UsersRepository,
} from '../../src/auth/users/users.repository';
import { NotificationService } from '../../src/notifications/notifications.service';
import type { JwtUser } from '../../src/shared/auth/jwt-user';
import { Role } from '../../src/shared/auth/role.enum';
import { CountingKvStore } from '../../src/shared/redis/counting-kv.store';
import { MemoryKvStore } from '../../src/shared/redis/memory-kv.store';
import { RedisOpsCounter } from '../../src/shared/redis/redis-ops.counter';
import { LWW_SKEW_MS } from '../../src/sync/sync.constants';
import { SyncService } from '../../src/sync/sync.service';
import { MemorySyncStore } from '../../src/sync/sync.store';
import type { SyncOpDto } from '../../src/sync/dto/sync-batch.dto';

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const JURIDICA_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function natural(sub: string): JwtUser {
  return { sub, role: Role.NATURAL };
}

function juridica(sub: string): JwtUser {
  return { sub, role: Role.JURIDICA, entityType: 'cooperativa' };
}

function iso(msFromNow: number): string {
  return new Date(Date.now() + msFromNow).toISOString();
}

function op(
  partial: Omit<SyncOpDto, 'opId' | 'entityId'> & Partial<SyncOpDto>,
): SyncOpDto {
  return {
    opId: partial.opId ?? randomUUID(),
    entityId: partial.entityId ?? randomUUID(),
    entity: partial.entity,
    clientTs: partial.clientTs,
    payload: partial.payload,
  };
}

function fakeNotifications(): NotificationService {
  return {
    send: () =>
      Promise.resolve({ id: randomUUID(), status: 'pending' as const }),
  } as unknown as NotificationService;
}

function fakeClima(alerts: MemoryWeatherAlertStore): ClimaService {
  return {
    upsertAlert: async (
      userId: string,
      input: {
        municipio: string;
        kind: 'rain' | 'frost';
        enabled?: boolean;
        id?: string;
      },
    ) => {
      const municipio = normalizeMunicipio(input.municipio);
      if (!municipio) {
        throw new Error('Invalid municipio');
      }
      const row = await alerts.upsert({
        id: input.id,
        userId,
        municipio,
        kind: input.kind,
        enabled: input.enabled !== false,
      });
      return {
        id: row.id,
        municipio: row.municipio,
        kind: row.kind,
        enabled: row.enabled,
      };
    },
  } as unknown as ClimaService;
}

function usersStub(user: AuthUser | null): UsersRepository {
  return {
    findById: jest.fn().mockResolvedValue(user),
  } as unknown as UsersRepository;
}

function build() {
  const postsStore = new MemoryPostsStore();
  const profilesStore = new MemoryProfilesStore();
  const conversationsStore = new MemoryConversationsStore();
  const alertsStore = new MemoryWeatherAlertStore();
  const pricesStore = new MemoryPricesStore();
  const syncStore = new MemorySyncStore();
  const posts = new PostsService(postsStore);
  const profiles = new ProfilesService(profilesStore);
  const conversations = new ConversationsService(
    conversationsStore,
    postsStore,
    fakeNotifications(),
  );
  const commodities = new CommoditiesService(
    pricesStore,
    new CountingKvStore(new MemoryKvStore(), new RedisOpsCounter()),
    usersStub({
      id: JURIDICA_ID,
      role: Role.JURIDICA,
      verified: true,
      entityType: 'cooperativa',
    }),
  );
  const svc = new SyncService(
    syncStore,
    posts,
    profiles,
    conversations,
    fakeClima(alertsStore),
    alertsStore,
    commodities,
    pricesStore,
  );
  return { svc, postsStore, conversationsStore };
}

describe('SyncService', () => {
  it('creates a post with the client id and replays the same opId', async () => {
    const { svc } = build();
    const entityId = randomUUID();
    const opId = randomUUID();
    const batch = [
      op({
        opId,
        entityId,
        entity: 'post',
        clientTs: iso(-3_600_000),
        payload: {
          title: 'Papa criolla',
          description: '50 kg Siachoque',
          category: 'papa',
        },
      }),
    ];
    const first = await svc.apply(natural(USER_A), batch);
    expect(first.results[0]?.status).toBe('applied');
    expect(first.results[0]?.entityId).toBe(entityId);

    const again = await svc.apply(natural(USER_A), batch);
    expect(again.results[0]?.status).toBe('applied');
    expect(again.results[0]?.entityId).toBe(entityId);
  });

  it('applies LWW on profile: older timestamp conflicts, newer wins', async () => {
    const { svc } = build();
    const older = iso(-120_000);
    const newer = iso(-30_000);
    const first = await svc.apply(natural(USER_A), [
      op({
        entity: 'profile',
        clientTs: newer,
        payload: {
          displayName: 'Finca Nueva',
          municipality: 'Siachoque',
          category: 'papa',
        },
      }),
    ]);
    expect(first.results[0]?.status).toBe('applied');

    const stale = await svc.apply(natural(USER_A), [
      op({
        entity: 'profile',
        clientTs: older,
        payload: {
          displayName: 'Finca Vieja',
          municipality: 'Siachoque',
          category: 'papa',
        },
      }),
    ]);
    expect(stale.results[0]?.status).toBe('conflict');
    const record = stale.results[0]?.record as { displayName: string };
    expect(record.displayName).toBe('Finca Nueva');
  });

  it('rejects a client clock more than 5 minutes ahead and still applies the rest of the batch', async () => {
    const { svc } = build();
    const result = await svc.apply(natural(USER_A), [
      op({
        entity: 'post',
        clientTs: iso(LWW_SKEW_MS + 5_000),
        payload: {
          title: 'Futuro',
          description: 'No debe entrar',
          category: 'papa',
        },
      }),
      op({
        entity: 'post',
        clientTs: iso(-1_000),
        payload: {
          title: 'Papa',
          description: 'Si entra',
          category: 'papa',
        },
      }),
    ]);
    expect(result.results[0]?.status).toBe('rejected');
    expect(result.results[0]?.reason).toContain('skew');
    expect(result.results[1]?.status).toBe('applied');
  });

  it('returns a user-scoped delta after since', async () => {
    const { svc } = build();
    const before = new Date(Date.now() - 1_000).toISOString();
    await svc.apply(natural(USER_A), [
      op({
        entity: 'post',
        clientTs: iso(-500),
        payload: {
          title: 'Papa',
          description: 'Lote',
          category: 'papa',
        },
      }),
    ]);
    const pull = await svc.apply(natural(USER_A), [], before);
    expect(pull.delta.posts).toHaveLength(1);
    expect(pull.delta.posts[0]?.title).toBe('Papa');

    const empty = await svc.apply(natural(USER_B), [], before);
    expect(empty.delta.posts).toHaveLength(0);
  });

  it('rejects precio from NATURAL and accepts it from verified JURIDICA', async () => {
    const { svc } = build();
    const payload = {
      producto: 'Papa criolla',
      region: 'Siachoque',
      precio: 2500,
    };
    const denied = await svc.apply(natural(USER_A), [
      op({ entity: 'precio', clientTs: iso(-1_000), payload }),
    ]);
    expect(denied.results[0]?.status).toBe('rejected');

    const ok = await svc.apply(juridica(JURIDICA_ID), [
      op({ entity: 'precio', clientTs: iso(-1_000), payload }),
    ]);
    expect(ok.results[0]?.status).toBe('applied');
  });

  it('opens a thread and sends a message with client ids', async () => {
    const { svc, postsStore } = build();
    const post = await postsStore.create({
      authorId: USER_A,
      title: 'Papa',
      description: 'Lote',
      category: 'papa',
    });
    const conversationId = randomUUID();
    const messageId = randomUUID();
    const started = await svc.apply(natural(USER_B), [
      op({
        entityId: conversationId,
        entity: 'conversation',
        clientTs: iso(-2_000),
        payload: { postId: post.id },
      }),
      op({
        entityId: messageId,
        entity: 'message',
        clientTs: iso(-1_000),
        payload: { conversationId, body: 'Sigue disponible?' },
      }),
    ]);
    expect(started.results[0]?.status).toBe('applied');
    expect(started.results[0]?.entityId).toBe(conversationId);
    expect(started.results[1]?.status).toBe('applied');
    expect(started.results[1]?.entityId).toBe(messageId);
  });

  it('rejects an invalid payload without aborting the batch', async () => {
    const { svc } = build();
    const result = await svc.apply(natural(USER_A), [
      op({
        entity: 'post',
        clientTs: iso(-1_000),
        payload: { title: '' },
      }),
      op({
        entity: 'alerta',
        clientTs: iso(-1_000),
        payload: { municipio: 'Siachoque', kind: 'frost' },
      }),
    ]);
    expect(result.results[0]?.status).toBe('rejected');
    expect(result.results[1]?.status).toBe('applied');
  });
});
