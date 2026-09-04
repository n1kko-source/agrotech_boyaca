import 'dart:typed_data';

import 'package:agrotech_boyaca/auth/models.dart';
import 'package:agrotech_boyaca/comunidad/photo_source.dart';
import 'package:agrotech_boyaca/comunidad/posts_api.dart';
import 'package:agrotech_boyaca/sync/models.dart';

class FakePostsGateway implements PostsGateway {
  FakePostsGateway({this.pages, this.searchHits, this.byId});

  List<PagedPosts>? pages;
  List<LocalPost>? searchHits;
  Map<String, LocalPost>? byId;
  Object? listError;
  Object? searchError;
  Object? getError;
  int listCalls = 0;
  int searchCalls = 0;
  String? lastSearch;
  String? lastCursor;

  @override
  Future<PagedPosts> list({int limit = 20, String? cursor}) async {
    listCalls += 1;
    lastCursor = cursor;
    final thrown = listError;
    if (thrown != null) {
      throw thrown;
    }
    if (pages == null || pages!.isEmpty) {
      return const PagedPosts(items: []);
    }
    if (cursor == null) {
      return pages!.first;
    }
    final index = pages!.indexWhere((page) => page.nextCursor == cursor);
    if (index >= 0 && index + 1 < pages!.length) {
      return pages![index + 1];
    }
    return pages!.last;
  }

  @override
  Future<List<LocalPost>> search(String q, {int limit = 20}) async {
    searchCalls += 1;
    lastSearch = q;
    final thrown = searchError;
    if (thrown != null) {
      throw thrown;
    }
    return searchHits ?? const [];
  }

  @override
  Future<LocalPost> getById(String id) async {
    final thrown = getError;
    if (thrown != null) {
      throw thrown;
    }
    final post = byId?[id];
    if (post == null) {
      throw const ApiException(
        status: 404,
        code: 'NOT_FOUND',
        message: 'Not found',
      );
    }
    return post;
  }
}

class FakePhotoSource implements PhotoSource {
  FakePhotoSource(this.bytes);

  final List<Uint8List> bytes;
  int calls = 0;

  @override
  Future<List<Uint8List>> pick({int maxCount = 4}) async {
    calls += 1;
    return bytes.take(maxCount).toList();
  }
}
