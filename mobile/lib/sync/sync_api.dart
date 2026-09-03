import '../auth/session_client.dart';
import 'models.dart';

abstract class SyncGateway {
  Future<SyncBatchResponse> push({
    String? since,
    required List<PendingOp> ops,
    String? userId,
  });
}

class SyncApi implements SyncGateway {
  SyncApi(this.client);

  final SessionClient client;

  @override
  Future<SyncBatchResponse> push({
    String? since,
    required List<PendingOp> ops,
    String? userId,
  }) async {
    final response = await client.post(
      '/sync',
      auth: true,
      body: {
        'since': ?since,
        'ops': ops.map((op) => op.toApiJson()).toList(),
      },
    );
    throwIfError(response);
    return SyncBatchResponse.fromJson(decodeJsonObject(response), userId: userId);
  }
}
