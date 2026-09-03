import 'dart:convert';

import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

import 'local_store.dart';
import 'models.dart';
import 'sqlite_schema.dart';
import 'sync.constants.dart';

class SqliteLocalStore implements LocalStore {
  SqliteLocalStore(this._db);

  final Database _db;

  static Future<SqliteLocalStore> open({
    String? path,
    DatabaseFactory? factory,
  }) async {
    final dbFactory = factory ?? databaseFactory;
    final dbPath = path ?? p.join(await dbFactory.getDatabasesPath(), sqliteDbFileName);
    final db = await dbFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: 1,
        onCreate: (db, version) => createSyncSchema(db),
      ),
    );
    return SqliteLocalStore(db);
  }

  @override
  Future<void> enqueuePost(LocalPost post, PendingOp op) {
    return _db.transaction((txn) async {
      await _upsertPost(txn, post);
      await _insertPending(txn, op);
    });
  }

  @override
  Future<void> enqueueProfile(LocalProfile profile, PendingOp op) {
    return _db.transaction((txn) async {
      await _upsertProfile(txn, profile);
      await _insertPending(txn, op);
    });
  }

  @override
  Future<void> enqueueConversation(LocalConversation conversation, PendingOp op) {
    return _db.transaction((txn) async {
      await _upsertConversation(txn, conversation);
      await _insertPending(txn, op);
    });
  }

  @override
  Future<void> enqueueMessage(LocalMessage message, PendingOp op) {
    return _db.transaction((txn) async {
      await _upsertMessage(txn, message);
      await _insertPending(txn, op);
    });
  }

  @override
  Future<void> enqueuePrice(LocalPrice price, PendingOp op) {
    return _db.transaction((txn) async {
      await _upsertPrice(txn, price);
      await _insertPending(txn, op);
    });
  }

  @override
  Future<void> enqueueAlert(LocalAlert alert, PendingOp op) {
    return _db.transaction((txn) async {
      await _upsertAlert(txn, alert);
      await _insertPending(txn, op);
    });
  }

  @override
  Future<List<PendingOp>> peekPending(
    String userId, {
    int limit = syncOpsMax,
  }) async {
    final rows = await _db.rawQuery(
      '''
      SELECT op_id, user_id, entity, entity_id, client_ts, payload_json
      FROM pending_ops
      WHERE user_id = ?
      ORDER BY
        CASE entity
          WHEN 'conversation' THEN 0
          WHEN 'message' THEN 2
          ELSE 1
        END,
        created_at ASC,
        op_id ASC
      LIMIT ?
      ''',
      [userId, limit],
    );
    return rows.map(_pendingFromRow).toList();
  }

  @override
  Future<void> removePending(Iterable<String> opIds) async {
    final ids = opIds.toList();
    if (ids.isEmpty) {
      return;
    }
    await _db.transaction((txn) async {
      for (final id in ids) {
        await txn.delete(
          'pending_ops',
          where: 'op_id = ?',
          whereArgs: [id],
        );
      }
    });
  }

  @override
  Future<int> pendingCount(String userId) async {
    final rows = await _db.rawQuery(
      'SELECT COUNT(*) AS c FROM pending_ops WHERE user_id = ?',
      [userId],
    );
    return Sqflite.firstIntValue(rows) ?? 0;
  }

  @override
  Future<void> upsertPost(LocalPost post) => _upsertPost(_db, post);

  @override
  Future<void> upsertProfile(LocalProfile profile) =>
      _upsertProfile(_db, profile);

  @override
  Future<void> upsertConversation(LocalConversation conversation) =>
      _upsertConversation(_db, conversation);

  @override
  Future<void> upsertMessage(LocalMessage message) =>
      _upsertMessage(_db, message);

  @override
  Future<void> upsertPrice(LocalPrice price) => _upsertPrice(_db, price);

  @override
  Future<void> upsertAlert(LocalAlert alert) => _upsertAlert(_db, alert);

  @override
  Future<void> deletePost(String id) =>
      _db.delete('posts', where: 'id = ?', whereArgs: [id]);

  @override
  Future<void> deleteProfile(String id) =>
      _db.delete('marketplace_profiles', where: 'id = ?', whereArgs: [id]);

  @override
  Future<void> deleteConversation(String id) =>
      _db.delete('conversations', where: 'id = ?', whereArgs: [id]);

  @override
  Future<void> deleteMessage(String id) =>
      _db.delete('messages', where: 'id = ?', whereArgs: [id]);

  @override
  Future<void> deletePrice(String id) =>
      _db.delete('commodity_prices', where: 'id = ?', whereArgs: [id]);

  @override
  Future<void> deleteAlert(String id) =>
      _db.delete('weather_alerts', where: 'id = ?', whereArgs: [id]);

  @override
  Future<LocalPost?> findPost(String id) async {
    final rows = await _db.query('posts', where: 'id = ?', whereArgs: [id]);
    if (rows.isEmpty) {
      return null;
    }
    return LocalPost.fromRow(rows.first);
  }

  @override
  Future<LocalProfile?> findProfileByUser(String userId) async {
    final rows = await _db.query(
      'marketplace_profiles',
      where: 'user_id = ?',
      whereArgs: [userId],
    );
    if (rows.isEmpty) {
      return null;
    }
    return LocalProfile.fromRow(rows.first);
  }

  @override
  Future<LocalMessage?> findMessage(String id) async {
    final rows = await _db.query('messages', where: 'id = ?', whereArgs: [id]);
    if (rows.isEmpty) {
      return null;
    }
    return LocalMessage.fromRow(rows.first);
  }

  @override
  Future<LocalPrice?> findPrice(String producto, String region) async {
    final rows = await _db.query(
      'commodity_prices',
      where: 'producto = ? AND region = ?',
      whereArgs: [producto, region],
    );
    if (rows.isEmpty) {
      return null;
    }
    return LocalPrice.fromRow(rows.first);
  }

  @override
  Future<List<LocalPost>> listPosts() async {
    final rows = await _db.query('posts', orderBy: 'created_at DESC');
    return rows.map(LocalPost.fromRow).toList();
  }

  @override
  Future<List<LocalMessage>> listMessages(String conversationId) async {
    final rows = await _db.query(
      'messages',
      where: 'conversation_id = ?',
      whereArgs: [conversationId],
      orderBy: 'created_at ASC',
    );
    return rows.map(LocalMessage.fromRow).toList();
  }

  @override
  Future<List<LocalPrice>> listPrices() async {
    final rows = await _db.query(
      'commodity_prices',
      orderBy: 'producto ASC, region ASC',
    );
    return rows.map(LocalPrice.fromRow).toList();
  }

  @override
  Future<String?> readSince(String userId) async {
    final rows = await _db.query(
      'sync_meta',
      where: 'key = ?',
      whereArgs: [_sinceKey(userId)],
    );
    if (rows.isEmpty) {
      return null;
    }
    return rows.first['value'] as String?;
  }

  @override
  Future<void> writeSince(String userId, String serverTime) {
    return _db.insert('sync_meta', {
      'key': _sinceKey(userId),
      'value': serverTime,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  @override
  Future<void> close() => _db.close();

  Future<void> _upsertPost(DatabaseExecutor db, LocalPost post) {
    return db.insert(
      'posts',
      post.toRow(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<void> _upsertProfile(DatabaseExecutor db, LocalProfile profile) async {
    await db.delete(
      'marketplace_profiles',
      where: 'user_id = ? OR id = ?',
      whereArgs: [profile.userId, profile.id],
    );
    await db.insert('marketplace_profiles', profile.toRow());
  }

  Future<void> _upsertConversation(
    DatabaseExecutor db,
    LocalConversation conversation,
  ) {
    return db.insert(
      'conversations',
      conversation.toRow(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<void> _upsertMessage(DatabaseExecutor db, LocalMessage message) {
    return db.insert(
      'messages',
      message.toRow(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<void> _upsertPrice(DatabaseExecutor db, LocalPrice price) async {
    await db.delete(
      'commodity_prices',
      where: 'id = ? OR (producto = ? AND region = ?)',
      whereArgs: [price.id, price.producto, price.region],
    );
    await db.insert('commodity_prices', price.toRow());
  }

  Future<void> _upsertAlert(DatabaseExecutor db, LocalAlert alert) async {
    await db.delete(
      'weather_alerts',
      where: 'id = ? OR (user_id = ? AND municipio = ? AND kind = ?)',
      whereArgs: [alert.id, alert.userId, alert.municipio, alert.kind],
    );
    await db.insert('weather_alerts', alert.toRow());
  }

  Future<void> _insertPending(DatabaseExecutor db, PendingOp op) {
    return db.insert('pending_ops', {
      'op_id': op.opId,
      'user_id': op.userId,
      'entity': op.entity.apiValue,
      'entity_id': op.entityId,
      'client_ts': op.clientTs.toUtc().toIso8601String(),
      'payload_json': jsonEncode(op.payload),
      'created_at': op.clientTs.toUtc().toIso8601String(),
    }, conflictAlgorithm: ConflictAlgorithm.ignore);
  }

  PendingOp _pendingFromRow(Map<String, Object?> row) {
    final entity = SyncEntityX.fromApi(row['entity'] as String?);
    if (entity == null) {
      throw const FormatException('Unknown pending entity');
    }
    final raw = jsonDecode(row['payload_json'] as String);
    return PendingOp(
      opId: row['op_id'] as String,
      userId: row['user_id'] as String,
      entity: entity,
      entityId: row['entity_id'] as String,
      clientTs: DateTime.parse(row['client_ts'] as String).toUtc(),
      payload: Map<String, dynamic>.from(raw as Map),
    );
  }

  String _sinceKey(String userId) => 'since:$userId';
}
