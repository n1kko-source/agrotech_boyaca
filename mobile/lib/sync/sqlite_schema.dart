import 'package:sqflite/sqflite.dart';

Future<void> createSyncSchema(Database db) async {
  await db.execute('''
    CREATE TABLE posts (
      id TEXT PRIMARY KEY NOT NULL,
      author_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  ''');
  await db.execute('''
    CREATE TABLE marketplace_profiles (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      municipality TEXT NOT NULL,
      bio TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  ''');
  await db.execute('''
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY NOT NULL,
      post_id TEXT NOT NULL,
      initiator_id TEXT NOT NULL,
      peer_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  ''');
  await db.execute('''
    CREATE TABLE messages (
      id TEXT PRIMARY KEY NOT NULL,
      conversation_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  ''');
  await db.execute(
    'CREATE INDEX messages_conversation ON messages(conversation_id, created_at)',
  );
  await db.execute('''
    CREATE TABLE commodity_prices (
      id TEXT PRIMARY KEY NOT NULL,
      producto TEXT NOT NULL,
      region TEXT NOT NULL,
      precio REAL NOT NULL,
      unidad TEXT NOT NULL DEFAULT 'kg',
      moneda TEXT NOT NULL DEFAULT 'COP',
      updated_at TEXT NOT NULL,
      UNIQUE(producto, region)
    )
  ''');
  await db.execute('''
    CREATE TABLE weather_alerts (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      municipio TEXT NOT NULL,
      kind TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, municipio, kind)
    )
  ''');
  await db.execute('''
    CREATE TABLE pending_ops (
      op_id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      client_ts TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  ''');
  await db.execute(
    'CREATE INDEX pending_ops_user ON pending_ops(user_id, created_at)',
  );
  await db.execute('''
    CREATE TABLE sync_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    )
  ''');
  await createPostPhotosTable(db);
}

Future<void> createPostPhotosTable(Database db) async {
  await db.execute('''
    CREATE TABLE post_photos (
      id TEXT PRIMARY KEY NOT NULL,
      post_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      bytes BLOB NOT NULL
    )
  ''');
  await db.execute(
    'CREATE INDEX post_photos_post ON post_photos(post_id, sort_order)',
  );
}
