import 'package:agrotech_boyaca/auth/models.dart';
import 'package:agrotech_boyaca/sync/models.dart';
import 'package:agrotech_boyaca/sync/sync.constants.dart';
import 'package:agrotech_boyaca/sync/sync_engine.dart';
import 'package:agrotech_boyaca/sync/uuid.dart';
import 'package:flutter_test/flutter_test.dart';

import '../helpers/fake_sync.dart';

void main() {
  late MemoryLocalStore store;
  late FakeSyncGateway api;
  late SyncEngine engine;
  var ids = 0;

  setUp(() {
    store = MemoryLocalStore();
    api = FakeSyncGateway();
    ids = 0;
    engine = SyncEngine(
      store: store,
      api: api,
      now: () => DateTime.utc(2026, 9, 1, 12),
      idGen: () {
        ids += 1;
        return '00000000-0000-4000-8000-${ids.toString().padLeft(12, '0')}';
      },
    );
  });

  test('createPost writes locally and queues clientTs + UUIDs', () async {
    final post = await engine.createPost(
      userId: 'user-1',
      title: 'Papa pastusa',
      description: 'Cosecha de Siachoque',
      category: 'papa',
    );
    expect(store.posts[post.id]?.title, 'Papa pastusa');
    expect(store.pending, hasLength(1));
    final op = store.pending.single;
    expect(op.entity, SyncEntity.post);
    expect(op.entityId, post.id);
    expect(op.clientTs, DateTime.utc(2026, 9, 1, 12));
    expect(op.payload['title'], 'Papa pastusa');
    expect(api.calls, 0);
  });

  test('updatePost enqueues the same entityId', () async {
    final created = await engine.createPost(
      userId: 'user-1',
      title: 'Papa',
      description: 'Tunja',
      category: 'papa',
    );
    final updated = await engine.updatePost(
      userId: 'user-1',
      id: created.id,
      title: 'Papa criolla',
      description: 'Siachoque',
      category: 'papa',
    );
    expect(updated.id, created.id);
    expect(store.posts[created.id]?.title, 'Papa criolla');
    expect(store.pending, hasLength(2));
    expect(store.pending.last.entityId, created.id);
    expect(store.pending.last.payload['title'], 'Papa criolla');
  });

  test(
    'flush posts a batch of 50 and applies delta + dequeues applied',
    () async {
      for (var i = 0; i < 51; i++) {
        await engine.createPost(
          userId: 'user-1',
          title: 'Lote $i',
          description: 'desc',
          category: 'papa',
        );
      }
      api.serverTime = '2026-09-01T12:01:00.000Z';
      api.delta = SyncDelta(
        posts: [
          LocalPost(
            id: 'delta-post',
            authorId: 'user-1',
            title: 'Desde el servidor',
            description: 'delta',
            category: 'papa',
            createdAt: DateTime.utc(2026, 9, 1, 11),
            updatedAt: DateTime.utc(2026, 9, 1, 11, 5),
          ),
        ],
        conversations: const [],
        messages: const [],
        alertas: const [],
      );

      await engine.flush('user-1');

      expect(api.calls, 2);
      expect(api.lastOps, hasLength(1));
      expect(store.pending, isEmpty);
      expect(store.since['user-1'], '2026-09-01T12:01:00.000Z');
      expect(store.posts['delta-post']?.title, 'Desde el servidor');
    },
  );

  test(
    'conflict applies the winning server record and leaves the queue',
    () async {
      await engine.upsertProfile(
        userId: 'user-1',
        displayName: 'Nombre viejo',
        municipality: 'Siachoque',
        category: 'papa',
      );
      final op = store.pending.single;
      api.serverTime = '2026-09-01T12:02:00.000Z';
      api.resultsFor = (ops) => [
        SyncOpResult(
          opId: op.opId,
          entity: SyncEntity.profile,
          entityId: op.entityId,
          status: SyncOpStatus.conflict,
          record: {
            'id': op.entityId,
            'userId': 'user-1',
            'displayName': 'Finca El Rosal',
            'municipality': 'Siachoque',
            'bio': '',
            'category': 'papa',
            'createdAt': '2026-09-01T11:00:00.000Z',
            'updatedAt': '2026-09-01T11:50:00.000Z',
          },
        ),
      ];

      await engine.flush('user-1');

      expect(store.pending, isEmpty);
      expect(store.profiles['user-1']?.displayName, 'Finca El Rosal');
    },
  );

  test('rejected without record reverts the optimistic write', () async {
    final post = await engine.createPost(
      userId: 'user-1',
      title: 'Inválido',
      description: 'x',
      category: 'papa',
    );
    api.serverTime = '2026-09-01T12:03:00.000Z';
    api.resultsFor = (ops) => [
      SyncOpResult(
        opId: store.pending.single.opId,
        entity: SyncEntity.post,
        entityId: post.id,
        status: SyncOpStatus.rejected,
        reason: 'Forbidden',
      ),
    ];

    await engine.flush('user-1');

    expect(store.pending, isEmpty);
    expect(store.posts.containsKey(post.id), isFalse);
  });

  test('keeps the queue on NetworkException', () async {
    await engine.createPost(
      userId: 'user-1',
      title: 'Papa',
      description: 'desc',
      category: 'papa',
    );
    api.error = const NetworkException();

    await expectLater(engine.flush('user-1'), throwsA(isA<NetworkException>()));
    expect(store.pending, hasLength(1));
    expect(store.since['user-1'], isNull);
  });

  test('conversation is flushed before its message', () async {
    final thread = await engine.startConversation(
      userId: 'user-1',
      postId: 'post-1',
    );
    await engine.sendMessage(
      userId: 'user-1',
      conversationId: thread.id,
      body: '¿Sigue disponible?',
    );
    await engine.flush('user-1');

    expect(api.lastOps.map((op) => op.entity), [
      SyncEntity.conversation,
      SyncEntity.message,
    ]);
  });

  test(
    'caches a price from GET /commodities/precios without enqueueing',
    () async {
      await engine.cachePrice(
        LocalPrice(
          id: 'price-1',
          producto: 'papa',
          region: 'siachoque',
          precio: 2000,
          unidad: 'kg',
          moneda: 'COP',
          updatedAt: DateTime.utc(2026, 9, 1),
        ),
      );
      expect(store.pending, isEmpty);
      expect(store.prices['papa|siachoque']?.precio, 2000);
    },
  );

  test('uuid v4 matches the backend shape', () {
    final id = uuidV4();
    expect(
      id,
      matches(
        RegExp(
          r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        ),
      ),
    );
  });

  test('empty queue without since does not hit the network', () async {
    await engine.flush('user-1');
    expect(api.calls, 0);
  });

  test('empty queue with since pulls the delta', () async {
    store.since['user-1'] = '2026-09-01T11:00:00.000Z';
    api.delta = SyncDelta(
      posts: const [],
      profile: LocalProfile(
        id: 'prof-1',
        userId: 'user-1',
        displayName: 'Finca El Rosal',
        municipality: 'Siachoque',
        bio: '',
        category: 'papa',
        createdAt: DateTime.utc(2026, 9, 1, 10),
        updatedAt: DateTime.utc(2026, 9, 1, 11),
      ),
      conversations: const [],
      messages: const [],
      alertas: const [],
    );
    await engine.flush('user-1');
    expect(api.calls, 1);
    expect(api.lastSince, '2026-09-01T11:00:00.000Z');
    expect(api.lastOps, isEmpty);
    expect(store.profiles['user-1']?.displayName, 'Finca El Rosal');
  });

  test('batch size never exceeds syncOpsMax', () async {
    expect(syncOpsMax, 50);
    for (var i = 0; i < 60; i++) {
      await engine.createPost(
        userId: 'user-1',
        title: 'Lote $i',
        description: 'desc',
        category: 'papa',
      );
    }
    final batch = await store.peekPending('user-1');
    expect(batch, hasLength(50));
  });
}
