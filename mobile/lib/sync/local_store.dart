import 'models.dart';
import 'sync.constants.dart';

/// Local SQLite mirror + pending-op queue. Implementations must keep
/// optimistic writes and the queue row in one transaction.
abstract class LocalStore {
  Future<void> enqueuePost(LocalPost post, PendingOp op);

  Future<void> enqueueProfile(LocalProfile profile, PendingOp op);

  Future<void> enqueueConversation(
    LocalConversation conversation,
    PendingOp op,
  );

  Future<void> enqueueMessage(LocalMessage message, PendingOp op);

  Future<void> enqueuePrice(LocalPrice price, PendingOp op);

  Future<void> enqueueAlert(LocalAlert alert, PendingOp op);

  Future<List<PendingOp>> peekPending(
    String userId, {
    int limit = syncOpsMax,
  });

  Future<void> removePending(Iterable<String> opIds);

  Future<int> pendingCount(String userId);

  Future<void> upsertPost(LocalPost post);

  Future<void> upsertProfile(LocalProfile profile);

  Future<void> upsertConversation(LocalConversation conversation);

  Future<void> upsertMessage(LocalMessage message);

  Future<void> upsertPrice(LocalPrice price);

  Future<void> upsertAlert(LocalAlert alert);

  Future<void> deletePost(String id);

  Future<void> deleteProfile(String id);

  Future<void> deleteConversation(String id);

  Future<void> deleteMessage(String id);

  Future<void> deletePrice(String id);

  Future<void> deleteAlert(String id);

  Future<LocalPost?> findPost(String id);

  Future<LocalProfile?> findProfileByUser(String userId);

  Future<LocalMessage?> findMessage(String id);

  Future<LocalPrice?> findPrice(String producto, String region);

  Future<List<LocalPost>> listPosts();

  Future<List<LocalMessage>> listMessages(String conversationId);

  Future<List<LocalPrice>> listPrices();

  Future<String?> readSince(String userId);

  Future<void> writeSince(String userId, String serverTime);

  Future<void> close();
}
