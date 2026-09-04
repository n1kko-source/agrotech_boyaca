import '../auth/session_client.dart';
import '../sync/models.dart';

abstract class PostsGateway {
  Future<PagedPosts> list({int limit = 20, String? cursor});

  Future<List<LocalPost>> search(String q, {int limit = 20});

  Future<LocalPost> getById(String id);
}

class PostsApi implements PostsGateway {
  PostsApi(this.client);

  final SessionClient client;

  @override
  Future<PagedPosts> list({int limit = 20, String? cursor}) async {
    final response = await client.get(
      '/posts',
      auth: true,
      query: {
        'limit': '$limit',
        if (cursor != null && cursor.isNotEmpty) 'cursor': cursor,
      },
    );
    throwIfError(response);
    return _page(decodeJsonObject(response));
  }

  @override
  Future<List<LocalPost>> search(String q, {int limit = 20}) async {
    final response = await client.get(
      '/posts/search',
      auth: true,
      query: {'q': q, 'limit': '$limit'},
    );
    throwIfError(response);
    final json = decodeJsonObject(response);
    return parseList(json['items'], LocalPost.fromJson);
  }

  @override
  Future<LocalPost> getById(String id) async {
    final response = await client.get('/posts/$id', auth: true);
    throwIfError(response);
    return LocalPost.fromJson(decodeJsonObject(response));
  }

  PagedPosts _page(Map<String, dynamic> json) {
    final cursor = json['nextCursor'];
    return PagedPosts(
      items: parseList(json['items'], LocalPost.fromJson),
      nextCursor: cursor is String && cursor.isNotEmpty ? cursor : null,
    );
  }
}
