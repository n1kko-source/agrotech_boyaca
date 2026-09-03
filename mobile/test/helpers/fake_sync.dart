import 'dart:async';

import 'package:agrotech_boyaca/sync/local_store.dart';
import 'package:agrotech_boyaca/sync/models.dart';
import 'package:agrotech_boyaca/sync/network_status.dart';
import 'package:agrotech_boyaca/sync/sync.constants.dart';
import 'package:agrotech_boyaca/sync/sync_api.dart';

class MemoryLocalStore implements LocalStore {
  final posts = <String, LocalPost>{};
  final profiles = <String, LocalProfile>{};
  final conversations = <String, LocalConversation>{};
  final messages = <String, LocalMessage>{};
  final prices = <String, LocalPrice>{};
  final alerts = <String, LocalAlert>{};
  final pending = <PendingOp>[];
  final since = <String, String>{};

  @override
  Future<void> enqueuePost(LocalPost post, PendingOp op) async {
    posts[post.id] = post;
    _enqueue(op);
  }

  @override
  Future<void> enqueueProfile(LocalProfile profile, PendingOp op) async {
    _putProfile(profile);
    _enqueue(op);
  }

  @override
  Future<void> enqueueConversation(
    LocalConversation conversation,
    PendingOp op,
  ) async {
    conversations[conversation.id] = conversation;
    _enqueue(op);
  }

  @override
  Future<void> enqueueMessage(LocalMessage message, PendingOp op) async {
    messages[message.id] = message;
    _enqueue(op);
  }

  @override
  Future<void> enqueuePrice(LocalPrice price, PendingOp op) async {
    _putPrice(price);
    _enqueue(op);
  }

  @override
  Future<void> enqueueAlert(LocalAlert alert, PendingOp op) async {
    _putAlert(alert);
    _enqueue(op);
  }

  @override
  Future<List<PendingOp>> peekPending(
    String userId, {
    int limit = syncOpsMax,
  }) async {
    final mine = pending.where((op) => op.userId == userId).toList()
      ..sort((a, b) {
        final rank = _rank(a.entity).compareTo(_rank(b.entity));
        if (rank != 0) {
          return rank;
        }
        return a.clientTs.compareTo(b.clientTs);
      });
    return mine.take(limit).toList();
  }

  @override
  Future<void> removePending(Iterable<String> opIds) async {
    final ids = opIds.toSet();
    pending.removeWhere((op) => ids.contains(op.opId));
  }

  @override
  Future<int> pendingCount(String userId) async {
    return pending.where((op) => op.userId == userId).length;
  }

  @override
  Future<void> upsertPost(LocalPost post) async {
    posts[post.id] = post;
  }

  @override
  Future<void> upsertProfile(LocalProfile profile) async {
    _putProfile(profile);
  }

  @override
  Future<void> upsertConversation(LocalConversation conversation) async {
    conversations[conversation.id] = conversation;
  }

  @override
  Future<void> upsertMessage(LocalMessage message) async {
    messages[message.id] = message;
  }

  @override
  Future<void> upsertPrice(LocalPrice price) async {
    _putPrice(price);
  }

  @override
  Future<void> upsertAlert(LocalAlert alert) async {
    _putAlert(alert);
  }

  @override
  Future<void> deletePost(String id) async => posts.remove(id);

  @override
  Future<void> deleteProfile(String id) async {
    profiles.removeWhere((_, profile) => profile.id == id);
  }

  @override
  Future<void> deleteConversation(String id) async => conversations.remove(id);

  @override
  Future<void> deleteMessage(String id) async => messages.remove(id);

  @override
  Future<void> deletePrice(String id) async {
    prices.removeWhere((_, price) => price.id == id);
  }

  @override
  Future<void> deleteAlert(String id) async {
    alerts.removeWhere((_, alert) => alert.id == id);
  }

  @override
  Future<LocalPost?> findPost(String id) async => posts[id];

  @override
  Future<LocalProfile?> findProfileByUser(String userId) async {
    return profiles[userId];
  }

  @override
  Future<LocalMessage?> findMessage(String id) async => messages[id];

  @override
  Future<LocalPrice?> findPrice(String producto, String region) async {
    return prices['$producto|$region'];
  }

  @override
  Future<List<LocalPost>> listPosts() async => posts.values.toList();

  @override
  Future<List<LocalMessage>> listMessages(String conversationId) async {
    return messages.values
        .where((row) => row.conversationId == conversationId)
        .toList();
  }

  @override
  Future<List<LocalPrice>> listPrices() async => prices.values.toList();

  @override
  Future<String?> readSince(String userId) async => since[userId];

  @override
  Future<void> writeSince(String userId, String serverTime) async {
    since[userId] = serverTime;
  }

  @override
  Future<void> close() async {}

  void _enqueue(PendingOp op) {
    if (pending.any((row) => row.opId == op.opId)) {
      return;
    }
    pending.add(op);
  }

  void _putProfile(LocalProfile profile) {
    profiles.removeWhere((_, row) => row.id == profile.id);
    profiles[profile.userId] = profile;
  }

  void _putPrice(LocalPrice price) {
    prices.removeWhere((_, row) => row.id == price.id);
    prices['${price.producto}|${price.region}'] = price;
  }

  void _putAlert(LocalAlert alert) {
    alerts.removeWhere((_, row) => row.id == alert.id);
    alerts['${alert.userId}|${alert.municipio}|${alert.kind}'] = alert;
  }

  int _rank(SyncEntity entity) {
    return switch (entity) {
      SyncEntity.conversation => 0,
      SyncEntity.message => 2,
      _ => 1,
    };
  }
}

class FakeSyncGateway implements SyncGateway {
  FakeSyncGateway();

  Object? error;
  String serverTime = '2026-09-01T12:00:00.000Z';
  SyncDelta delta = const SyncDelta(
    posts: [],
    conversations: [],
    messages: [],
    alertas: [],
  );
  List<SyncOpResult> Function(List<PendingOp> ops)? resultsFor;
  int calls = 0;
  String? lastSince;
  List<PendingOp> lastOps = const [];

  @override
  Future<SyncBatchResponse> push({
    String? since,
    required List<PendingOp> ops,
    String? userId,
  }) async {
    calls += 1;
    lastSince = since;
    lastOps = List.of(ops);
    final thrown = error;
    if (thrown != null) {
      throw thrown;
    }
    final results =
        resultsFor?.call(ops) ??
        [
          for (final op in ops)
            SyncOpResult(
              opId: op.opId,
              entity: op.entity,
              entityId: op.entityId,
              status: SyncOpStatus.applied,
            ),
        ];
    return SyncBatchResponse(
      serverTime: serverTime,
      results: results,
      delta: delta,
    );
  }
}

class FakeNetworkStatus implements NetworkStatus {
  FakeNetworkStatus({this.online = false});

  bool online;
  final _changes = StreamController<bool>.broadcast();

  @override
  Future<bool> get isOnline async => online;

  @override
  Stream<bool> get changes => _changes.stream;

  void goOnline() {
    online = true;
    _changes.add(true);
  }

  void goOffline() {
    online = false;
    _changes.add(false);
  }

  Future<void> close() => _changes.close();
}
