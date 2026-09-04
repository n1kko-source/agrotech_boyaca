import 'dart:async';
import 'dart:typed_data';

import 'package:agrotech_boyaca/app.dart';
import 'package:agrotech_boyaca/auth/auth_controller.dart';
import 'package:agrotech_boyaca/auth/token_store.dart';
import 'package:agrotech_boyaca/comunidad/offer_fields.dart';
import 'package:agrotech_boyaca/comunidad/posts_controller.dart';
import 'package:agrotech_boyaca/sync/models.dart';
import 'package:agrotech_boyaca/sync/sync_controller.dart';
import 'package:agrotech_boyaca/sync/sync_engine.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../helpers/fake_auth.dart';
import '../helpers/fake_posts.dart';
import '../helpers/fake_sync.dart';

void main() {
  testWidgets(
    'feed pages from SQLite when offline and pull-to-refresh stays local',
    (tester) async {
      final env = await _env(online: false);
      final ts = DateTime.utc(2026, 9, 1, 12);
      await env.store.upsertPost(
        LocalPost(
          id: 'post-local',
          authorId: 'user-1',
          title: 'Papa criolla',
          description:
              'Cantidad: 50 kg\nPrecio: 2000 COP/kg\nUbicación: Siachoque',
          category: 'papa',
          createdAt: ts,
          updatedAt: ts,
        ),
      );

      await tester.pumpWidget(
        AgroTechApp(auth: env.auth, sync: env.sync, posts: env.posts),
      );
      await tester.pump();
      await tester.pump();
      await tester.pumpAndSettle();

      expect(find.text('Papa criolla'), findsOneWidget);
      expect(env.api.listCalls, 0);

      await tester.fling(
        find.byKey(const Key('feed_refresh')),
        const Offset(0, 300),
        1000,
      );
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));
      await tester.pumpAndSettle();
      expect(env.api.listCalls, 0);
      expect(find.text('Papa criolla'), findsOneWidget);
    },
  );

  testWidgets('search shows a clear empty state', (tester) async {
    final env = await _env(online: true);
    env.api.searchHits = const [];

    await tester.pumpWidget(
      AgroTechApp(auth: env.auth, sync: env.sync, posts: env.posts),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('open_search')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('search_field')), 'xyzzy');
    await tester.tap(find.byKey(const Key('search_submit')));
    await tester.pump();
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('search_empty')), findsOneWidget);
    expect(find.textContaining('Sin resultados para «xyzzy»'), findsOneWidget);
    expect(env.api.lastSearch, 'xyzzy');
  });

  testWidgets('create form enqueues offline and shows the post in the feed', (
    tester,
  ) async {
    final env = await _env(online: false);
    env.photos.bytes.add(_pixelPng);

    await tester.pumpWidget(
      AgroTechApp(auth: env.auth, sync: env.sync, posts: env.posts),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('create_post')));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('offer_product')),
      'Papa pastusa',
    );
    await tester.enterText(find.byKey(const Key('offer_category')), 'papa');
    await tester.enterText(find.byKey(const Key('offer_quantity')), '40');
    await tester.enterText(find.byKey(const Key('offer_price')), '1800');
    await tester.enterText(
      find.byKey(const Key('offer_location')),
      'Siachoque',
    );
    await tester.ensureVisible(find.byKey(const Key('offer_add_photo')));
    await tester.tap(find.byKey(const Key('offer_add_photo')));
    await tester.pump();
    await tester.ensureVisible(find.byKey(const Key('offer_save')));
    await tester.tap(find.byKey(const Key('offer_save')));
    await tester.pump();
    await tester.pumpAndSettle();

    expect(find.text('Papa pastusa'), findsOneWidget);
    expect(env.store.pending, hasLength(1));
    expect(env.store.pending.single.entity, SyncEntity.post);
    expect(env.store.pending.single.payload['title'], 'Papa pastusa');
    expect(
      env.store.pending.single.payload['description'],
      contains('Ubicación: Siachoque'),
    );
    expect(env.photos.calls, 1);
    expect(env.store.photos.values.single, hasLength(1));
    expect(env.sync.pendingCount, 1);
  });

  test('saveOffer update reuses entityId on the queue', () async {
    final env = await _env(online: false);
    final created = await env.posts.saveOffer(
      fields: const OfferFields(
        product: 'Papa',
        category: 'papa',
        quantity: '10',
        location: 'Tunja',
      ),
    );
    expect(env.store.pending, hasLength(1));
    await env.posts.saveOffer(
      fields: const OfferFields(
        product: 'Papa criolla',
        category: 'papa',
        quantity: '12',
        location: 'Siachoque',
      ),
      id: created.id,
    );
    expect(env.store.pending, hasLength(2));
    expect(env.store.pending.last.entityId, created.id);
    expect(env.store.posts[created.id]?.title, 'Papa criolla');
  });
}

class _FakePhotos extends FakePhotoSource {
  _FakePhotos() : super(<Uint8List>[]);
}

Future<
  ({
    AuthController auth,
    SyncController sync,
    PostsController posts,
    MemoryLocalStore store,
    FakePostsGateway api,
    FakeNetworkStatus network,
    _FakePhotos photos,
  })
>
_env({required bool online}) async {
  final tokens = MemoryTokenStore();
  final authApi = FakeAuthGateway(tokens);
  final auth = AuthController(store: tokens, api: authApi);
  await auth.restore();
  await auth.sendOtp('+573001112233');
  await auth.verifyOtp(code: '123456', acceptPrivacyPolicy: true);

  final store = MemoryLocalStore();
  final syncApi = FakeSyncGateway();
  final network = FakeNetworkStatus(online: online);
  final sync = SyncController(
    engine: SyncEngine(store: store, api: syncApi),
    auth: auth,
    network: network,
  );
  final api = FakePostsGateway();
  final photos = _FakePhotos();
  final posts = PostsController(sync: sync, api: api, photos: photos);
  addTearDown(() {
    posts.dispose();
    sync.dispose();
    unawaited(network.close());
  });
  return (
    auth: auth,
    sync: sync,
    posts: posts,
    store: store,
    api: api,
    network: network,
    photos: photos,
  );
}

final _pixelPng = Uint8List.fromList(const [
  0x89,
  0x50,
  0x4E,
  0x47,
  0x0D,
  0x0A,
  0x1A,
  0x0A,
  0x00,
  0x00,
  0x00,
  0x0D,
  0x49,
  0x48,
  0x44,
  0x52,
  0x00,
  0x00,
  0x00,
  0x01,
  0x00,
  0x00,
  0x00,
  0x01,
  0x08,
  0x06,
  0x00,
  0x00,
  0x00,
  0x1F,
  0x15,
  0xC4,
  0x89,
  0x00,
  0x00,
  0x00,
  0x0A,
  0x49,
  0x44,
  0x41,
  0x54,
  0x78,
  0x9C,
  0x63,
  0x00,
  0x01,
  0x00,
  0x00,
  0x05,
  0x00,
  0x01,
  0x0D,
  0x0A,
  0x2D,
  0xB4,
  0x00,
  0x00,
  0x00,
  0x00,
  0x49,
  0x45,
  0x4E,
  0x44,
  0xAE,
  0x42,
  0x60,
  0x82,
]);
