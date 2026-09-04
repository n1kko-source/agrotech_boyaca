import 'dart:typed_data';

import 'package:agrotech_boyaca/sync/models.dart';
import 'package:agrotech_boyaca/sync/sqlite_local_store.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  late SqliteLocalStore store;

  setUp(() async {
    store = await SqliteLocalStore.open(path: inMemoryDatabasePath);
  });

  tearDown(() async {
    await store.close();
  });

  test('schema mirrors posts, prices, messages and profile', () async {
    final ts = DateTime.utc(2026, 9, 1, 12);
    await store.upsertPost(
      LocalPost(
        id: 'post-1',
        authorId: 'user-1',
        title: 'Papa pastusa',
        description: '50 kg',
        category: 'papa',
        createdAt: ts,
        updatedAt: ts,
      ),
    );
    await store.upsertProfile(
      LocalProfile(
        id: 'prof-1',
        userId: 'user-1',
        displayName: 'Finca El Rosal',
        municipality: 'Siachoque',
        bio: '',
        category: 'papa',
        createdAt: ts,
        updatedAt: ts,
      ),
    );
    await store.upsertConversation(
      LocalConversation(
        id: 'conv-1',
        postId: 'post-1',
        initiatorId: 'user-2',
        peerId: 'user-1',
        createdAt: ts,
      ),
    );
    await store.upsertMessage(
      LocalMessage(
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-2',
        body: 'Hola',
        createdAt: ts,
      ),
    );
    await store.upsertPrice(
      LocalPrice(
        id: 'price-1',
        producto: 'papa',
        region: 'siachoque',
        precio: 2000,
        unidad: 'kg',
        moneda: 'COP',
        updatedAt: ts,
      ),
    );

    expect((await store.findPost('post-1'))?.title, 'Papa pastusa');
    expect(
      (await store.findProfileByUser('user-1'))?.displayName,
      'Finca El Rosal',
    );
    expect((await store.listMessages('conv-1')).single.body, 'Hola');
    expect((await store.findPrice('papa', 'siachoque'))?.precio, 2000);
  });

  test(
    'enqueue is transactional: post + pending op with local timestamp',
    () async {
      final ts = DateTime.utc(2026, 9, 1, 8, 30);
      await store.enqueuePost(
        LocalPost(
          id: 'post-2',
          authorId: 'user-1',
          title: 'Habas',
          description: 'Tunja',
          category: 'haba',
          createdAt: ts,
          updatedAt: ts,
        ),
        PendingOp(
          opId: 'op-1',
          userId: 'user-1',
          entity: SyncEntity.post,
          entityId: 'post-2',
          clientTs: ts,
          payload: {
            'title': 'Habas',
            'description': 'Tunja',
            'category': 'haba',
          },
        ),
      );

      final queued = await store.peekPending('user-1');
      expect(queued, hasLength(1));
      expect(queued.single.clientTs, ts);
      expect(queued.single.payload['title'], 'Habas');
      expect(await store.pendingCount('user-1'), 1);

      await store.removePending(['op-1']);
      expect(await store.pendingCount('user-1'), 0);
      expect((await store.findPost('post-2'))?.title, 'Habas');
    },
  );

  test('since is stored per user', () async {
    await store.writeSince('user-1', '2026-09-01T12:00:00.000Z');
    expect(await store.readSince('user-1'), '2026-09-01T12:00:00.000Z');
    expect(await store.readSince('user-2'), isNull);
  });

  test('listPostsPage is cursor-based newest first', () async {
    await store.upsertPost(
      LocalPost(
        id: 'a',
        authorId: 'user-1',
        title: 'Vieja',
        description: 'x',
        category: 'papa',
        createdAt: DateTime.utc(2026, 8, 1),
        updatedAt: DateTime.utc(2026, 8, 1),
      ),
    );
    await store.upsertPost(
      LocalPost(
        id: 'b',
        authorId: 'user-1',
        title: 'Nueva',
        description: 'x',
        category: 'papa',
        createdAt: DateTime.utc(2026, 9, 1),
        updatedAt: DateTime.utc(2026, 9, 1),
      ),
    );
    final first = await store.listPostsPage(limit: 1);
    expect(first.items.single.title, 'Nueva');
    expect(first.nextCursor, isNotNull);
    final second = await store.listPostsPage(
      limit: 1,
      cursor: first.nextCursor,
    );
    expect(second.items.single.title, 'Vieja');
    expect(second.nextCursor, isNull);
  });

  test('post photos persist as blobs', () async {
    await store.replacePostPhotos('post-1', [
      Uint8List.fromList([1, 2, 3]),
    ]);
    final photos = await store.listPostPhotos('post-1');
    expect(photos.single, [1, 2, 3]);
  });

  test('profile upsert by user_id replaces the previous row', () async {
    final ts = DateTime.utc(2026, 9, 1);
    await store.upsertProfile(
      LocalProfile(
        id: 'old-id',
        userId: 'user-1',
        displayName: 'Antes',
        municipality: 'Siachoque',
        bio: '',
        category: 'papa',
        createdAt: ts,
        updatedAt: ts,
      ),
    );
    await store.upsertProfile(
      LocalProfile(
        id: 'new-id',
        userId: 'user-1',
        displayName: 'Después',
        municipality: 'Siachoque',
        bio: 'bio',
        category: 'papa',
        createdAt: ts,
        updatedAt: ts,
      ),
    );
    final profile = await store.findProfileByUser('user-1');
    expect(profile?.id, 'new-id');
    expect(profile?.displayName, 'Después');
  });
}
