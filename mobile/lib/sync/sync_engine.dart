import 'dart:async';
import 'dart:typed_data';

import 'local_store.dart';
import 'models.dart';
import 'sync.constants.dart';
import 'sync_api.dart';
import 'uuid.dart';

typedef Now = DateTime Function();
typedef IdGen = String Function();

/// Enqueues offline writes, posts them to `POST /sync`, and applies the
/// server delta onto SQLite. One flush in flight (same idea as refresh).
class SyncEngine {
  SyncEngine({
    required LocalStore store,
    required SyncGateway api,
    Now now = DateTime.now,
    IdGen idGen = uuidV4,
  }) : this._(store, api, now, idGen);

  SyncEngine._(this._store, this._api, this.now, this.idGen);

  final LocalStore _store;
  final SyncGateway _api;
  final Now now;
  final IdGen idGen;

  Future<void>? _flushing;

  Future<LocalPost> createPost({
    required String userId,
    required String title,
    required String description,
    required String category,
  }) async {
    final ts = now().toUtc();
    final post = LocalPost(
      id: idGen(),
      authorId: userId,
      title: title.trim(),
      description: description.trim(),
      category: category.trim(),
      createdAt: ts,
      updatedAt: ts,
    );
    await _store.enqueuePost(
      post,
      _op(
        userId: userId,
        entity: SyncEntity.post,
        entityId: post.id,
        clientTs: ts,
        payload: {
          'title': post.title,
          'description': post.description,
          'category': post.category,
        },
      ),
    );
    return post;
  }

  Future<LocalPost> updatePost({
    required String userId,
    required String id,
    required String title,
    required String description,
    required String category,
  }) async {
    final existing = await _store.findPost(id);
    if (existing == null || existing.authorId != userId) {
      throw StateError('Post not found');
    }
    final ts = now().toUtc();
    final post = existing.copyWith(
      title: title.trim(),
      description: description.trim(),
      category: category.trim(),
      updatedAt: ts,
    );
    await _store.enqueuePost(
      post,
      _op(
        userId: userId,
        entity: SyncEntity.post,
        entityId: post.id,
        clientTs: ts,
        payload: {
          'title': post.title,
          'description': post.description,
          'category': post.category,
        },
      ),
    );
    return post;
  }

  Future<void> cachePosts(Iterable<LocalPost> posts) async {
    for (final post in posts) {
      await _store.upsertPost(post);
    }
  }

  Future<LocalPost?> findPost(String id) => _store.findPost(id);

  Future<PagedPosts> listPostsPage({int limit = 20, String? cursor}) {
    return _store.listPostsPage(limit: limit, cursor: cursor);
  }

  Future<List<LocalPost>> searchLocalPosts(String query, {int limit = 50}) {
    return _store.searchPosts(query, limit: limit);
  }

  Future<void> savePostPhotos(String postId, List<Uint8List> photos) {
    return _store.replacePostPhotos(postId, photos);
  }

  Future<List<Uint8List>> listPostPhotos(String postId) {
    return _store.listPostPhotos(postId);
  }

  Future<LocalProfile> upsertProfile({
    required String userId,
    required String displayName,
    required String municipality,
    required String category,
    String bio = '',
  }) async {
    final ts = now().toUtc();
    final existing = await _store.findProfileByUser(userId);
    final profile = LocalProfile(
      id: existing?.id ?? idGen(),
      userId: userId,
      displayName: displayName.trim(),
      municipality: municipality.trim(),
      bio: bio.trim(),
      category: category.trim(),
      createdAt: existing?.createdAt ?? ts,
      updatedAt: ts,
    );
    await _store.enqueueProfile(
      profile,
      _op(
        userId: userId,
        entity: SyncEntity.profile,
        entityId: profile.id,
        clientTs: ts,
        payload: {
          'displayName': profile.displayName,
          'municipality': profile.municipality,
          'category': profile.category,
          if (profile.bio.isNotEmpty) 'bio': profile.bio,
        },
      ),
    );
    return profile;
  }

  Future<LocalConversation> startConversation({
    required String userId,
    required String postId,
  }) async {
    final ts = now().toUtc();
    final conversation = LocalConversation(
      id: idGen(),
      postId: postId,
      initiatorId: userId,
      peerId: '',
      createdAt: ts,
    );
    await _store.enqueueConversation(
      conversation,
      _op(
        userId: userId,
        entity: SyncEntity.conversation,
        entityId: conversation.id,
        clientTs: ts,
        payload: {'postId': postId},
      ),
    );
    return conversation;
  }

  Future<LocalMessage> sendMessage({
    required String userId,
    required String conversationId,
    required String body,
  }) async {
    final trimmed = body.trim();
    if (trimmed.length < messageBodyMin || trimmed.length > messageBodyMax) {
      throw ArgumentError('Message body length');
    }
    final ts = now().toUtc();
    final message = LocalMessage(
      id: idGen(),
      conversationId: conversationId,
      senderId: userId,
      body: trimmed,
      createdAt: ts,
    );
    await _store.enqueueMessage(
      message,
      _op(
        userId: userId,
        entity: SyncEntity.message,
        entityId: message.id,
        clientTs: ts,
        payload: {'conversationId': conversationId, 'body': trimmed},
      ),
    );
    return message;
  }

  Future<LocalPrice> upsertPrice({
    required String userId,
    required String producto,
    required String region,
    required double precio,
    String unidad = pricesUnidadDefault,
  }) async {
    final ts = now().toUtc();
    final price = LocalPrice(
      id: idGen(),
      producto: producto.trim(),
      region: region.trim(),
      precio: precio,
      unidad: unidad.trim().isEmpty ? pricesUnidadDefault : unidad.trim(),
      moneda: pricesMonedaDefault,
      updatedAt: ts,
    );
    await _store.enqueuePrice(
      price,
      _op(
        userId: userId,
        entity: SyncEntity.precio,
        entityId: price.id,
        clientTs: ts,
        payload: {
          'producto': price.producto,
          'region': price.region,
          'precio': price.precio,
          'unidad': price.unidad,
        },
      ),
    );
    return price;
  }

  Future<LocalAlert> upsertAlert({
    required String userId,
    required String municipio,
    required String kind,
    bool enabled = true,
  }) async {
    final ts = now().toUtc();
    final alert = LocalAlert(
      id: idGen(),
      userId: userId,
      municipio: municipio.trim(),
      kind: kind,
      enabled: enabled,
      updatedAt: ts,
    );
    await _store.enqueueAlert(
      alert,
      _op(
        userId: userId,
        entity: SyncEntity.alerta,
        entityId: alert.id,
        clientTs: ts,
        payload: {
          'municipio': alert.municipio,
          'kind': alert.kind,
          'enabled': alert.enabled,
        },
      ),
    );
    return alert;
  }

  Future<void> cachePrice(LocalPrice price) => _store.upsertPrice(price);

  Future<int> pendingCount(String userId) => _store.pendingCount(userId);

  /// Pushes up to [syncOpsMax] ops per request until the queue is empty or
  /// the network fails. An empty queue still pulls the delta when `since`
  /// exists.
  Future<void> flush(String userId) async {
    if (_flushing != null) {
      await _flushing;
      return;
    }
    final done = Completer<void>();
    _flushing = done.future;
    try {
      var pulled = false;
      var batches = 0;
      while (true) {
        if (++batches > 32) {
          return;
        }
        final ops = await _store.peekPending(userId);
        final since = await _store.readSince(userId);
        if (ops.isEmpty && since == null) {
          return;
        }
        if (ops.isEmpty && pulled) {
          return;
        }
        final response = await _api.push(
          since: since,
          ops: ops,
          userId: userId,
        );
        await _applyResults(response.results);
        await applyDelta(response.delta);
        await _store.writeSince(userId, response.serverTime);
        pulled = true;
        if (ops.isEmpty) {
          return;
        }
      }
    } finally {
      done.complete();
      _flushing = null;
    }
  }

  Future<void> applyDelta(SyncDelta delta) async {
    for (final post in delta.posts) {
      await _store.upsertPost(post);
    }
    if (delta.profile != null) {
      await _store.upsertProfile(delta.profile!);
    }
    for (final conversation in delta.conversations) {
      await _store.upsertConversation(conversation);
    }
    for (final message in delta.messages) {
      await _store.upsertMessage(message);
    }
    for (final alert in delta.alertas) {
      await _store.upsertAlert(alert);
    }
  }

  Future<void> _applyResults(List<SyncOpResult> results) async {
    final done = <String>[];
    for (final result in results) {
      done.add(result.opId);
      if (result.record != null) {
        await _applyRecord(result.entity, result.record!);
        continue;
      }
      if (result.status == SyncOpStatus.rejected) {
        await _revertOptimistic(result.entity, result.entityId);
      }
    }
    await _store.removePending(done);
  }

  Future<void> _applyRecord(
    SyncEntity entity,
    Map<String, dynamic> record,
  ) async {
    try {
      await switch (entity) {
        SyncEntity.post => _store.upsertPost(LocalPost.fromJson(record)),
        SyncEntity.profile => _store.upsertProfile(
          LocalProfile.fromJson(record),
        ),
        SyncEntity.conversation => _store.upsertConversation(
          LocalConversation.fromJson(record),
        ),
        SyncEntity.message => _store.upsertMessage(
          LocalMessage.fromJson(record),
        ),
        SyncEntity.alerta => _store.upsertAlert(LocalAlert.fromJson(record)),
        SyncEntity.precio => _store.upsertPrice(LocalPrice.fromJson(record)),
      };
    } on FormatException {
      // Keep the optimistic row if the server record is unusable.
    }
  }

  Future<void> _revertOptimistic(SyncEntity entity, String entityId) {
    return switch (entity) {
      SyncEntity.post => _store.deletePost(entityId),
      SyncEntity.profile => _store.deleteProfile(entityId),
      SyncEntity.conversation => _store.deleteConversation(entityId),
      SyncEntity.message => _store.deleteMessage(entityId),
      SyncEntity.alerta => _store.deleteAlert(entityId),
      SyncEntity.precio => _store.deletePrice(entityId),
    };
  }

  PendingOp _op({
    required String userId,
    required SyncEntity entity,
    required String entityId,
    required DateTime clientTs,
    required Map<String, dynamic> payload,
  }) {
    return PendingOp(
      opId: idGen(),
      userId: userId,
      entity: entity,
      entityId: entityId,
      clientTs: clientTs,
      payload: payload,
    );
  }
}
