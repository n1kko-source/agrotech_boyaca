import 'package:flutter/foundation.dart';

import '../auth/models.dart';
import '../sync/models.dart';
import '../sync/sync_controller.dart';
import 'offer_fields.dart';
import 'photo_source.dart';
import 'posts_api.dart';

class PostsController extends ChangeNotifier {
  PostsController({
    required SyncController sync,
    required PostsGateway api,
    PhotoSource? photos,
  }) : this._(sync, api, photos);

  PostsController._(this._sync, this._api, this._photos);

  final SyncController _sync;
  final PostsGateway _api;
  final PhotoSource? _photos;

  List<LocalPost> feed = const [];
  String? feedCursor;
  bool feedLoading = false;
  bool feedLoadingMore = false;
  String? feedError;
  bool feedFromCache = false;

  List<LocalPost> searchHits = const [];
  bool searchLoading = false;
  String lastQuery = '';
  bool searchEmpty = false;
  String? searchError;

  String? _remoteCursor;
  bool _remoteExhausted = false;

  Future<void> refreshFeed() async {
    feedLoading = true;
    feedError = null;
    notifyListeners();
    _remoteCursor = null;
    _remoteExhausted = false;
    try {
      await _sync.flushNow();
      if (_sync.status != SyncUiStatus.offline) {
        try {
          final page = await _api.list();
          await _sync.engine.cachePosts(page.items);
          _remoteCursor = page.nextCursor;
          _remoteExhausted = page.nextCursor == null;
          feedFromCache = false;
        } on NetworkException {
          feedFromCache = true;
        } on ApiException catch (error) {
          feedError = error.message;
          feedFromCache = true;
        }
      } else {
        feedFromCache = true;
      }
      final local = await _sync.engine.listPostsPage();
      feed = local.items;
      feedCursor = local.nextCursor;
    } finally {
      feedLoading = false;
      notifyListeners();
    }
  }

  Future<void> loadMore() async {
    if (feedLoadingMore || feedCursor == null) {
      return;
    }
    feedLoadingMore = true;
    notifyListeners();
    try {
      if (_sync.status != SyncUiStatus.offline &&
          !_remoteExhausted &&
          _remoteCursor != null) {
        try {
          final page = await _api.list(cursor: _remoteCursor);
          await _sync.engine.cachePosts(page.items);
          _remoteCursor = page.nextCursor;
          _remoteExhausted = page.nextCursor == null;
        } on NetworkException {
          // Stay on the SQLite page.
        } on ApiException {
          _remoteExhausted = true;
        }
      }
      final local = await _sync.engine.listPostsPage(cursor: feedCursor);
      final seen = {for (final post in feed) post.id};
      feed = [...feed, ...local.items.where((post) => !seen.contains(post.id))];
      feedCursor = local.nextCursor;
    } finally {
      feedLoadingMore = false;
      notifyListeners();
    }
  }

  Future<void> search(String query) async {
    lastQuery = query.trim();
    searchEmpty = false;
    searchError = null;
    if (lastQuery.isEmpty) {
      searchHits = const [];
      notifyListeners();
      return;
    }
    searchLoading = true;
    notifyListeners();
    try {
      if (_sync.status != SyncUiStatus.offline) {
        try {
          final hits = await _api.search(lastQuery);
          await _sync.engine.cachePosts(hits);
          searchHits = hits;
          searchEmpty = hits.isEmpty;
          return;
        } on NetworkException {
          // Local cache below.
        } on ApiException catch (error) {
          searchError = error.message;
        }
      }
      searchHits = await _sync.engine.searchLocalPosts(lastQuery);
      searchEmpty = searchHits.isEmpty;
    } finally {
      searchLoading = false;
      notifyListeners();
    }
  }

  Future<LocalPost?> loadDetail(String id) async {
    if (_sync.status != SyncUiStatus.offline) {
      try {
        final remote = await _api.getById(id);
        await _sync.engine.cachePosts([remote]);
        return remote;
      } on NetworkException {
        // SQLite below.
      } on ApiException {
        // SQLite below (own optimistic row or 404).
      }
    }
    return _sync.engine.findPost(id);
  }

  Future<List<Uint8List>> photosFor(String postId) {
    return _sync.engine.listPostPhotos(postId);
  }

  Future<List<Uint8List>> pickPhotos({int already = 0}) async {
    final source = _photos;
    if (source == null) {
      return const [];
    }
    final remaining = postPhotosMax - already;
    if (remaining <= 0) {
      return const [];
    }
    return source.pick(maxCount: remaining);
  }

  Future<LocalPost> saveOffer({
    required OfferFields fields,
    String? id,
    List<Uint8List> photos = const [],
  }) async {
    final title = fields.product.trim();
    final category = fields.category.trim();
    final description = fields.toDescription();
    if (title.isEmpty || category.isEmpty || description.isEmpty) {
      throw ArgumentError('Missing offer fields');
    }
    if (title.length > postTitleMax ||
        category.length > postCategoryMax ||
        description.length > postDescriptionMax) {
      throw ArgumentError('Offer exceeds API limits');
    }
    final post = id == null
        ? await _sync.createPost(
            title: title,
            description: description,
            category: category,
          )
        : await _sync.updatePost(
            id: id,
            title: title,
            description: description,
            category: category,
          );
    await _sync.engine.savePostPhotos(post.id, photos);
    await refreshFeed();
    return post;
  }

  Future<LocalConversation> contactAuthor(String postId) {
    return _sync.startConversation(postId: postId);
  }
}
