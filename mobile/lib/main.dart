import 'dart:async';

import 'package:flutter/material.dart';

import 'app.dart';
import 'auth/auth_api.dart';
import 'auth/auth_controller.dart';
import 'auth/secure_token_store.dart';
import 'auth/session_client.dart';
import 'comunidad/photo_source.dart';
import 'comunidad/posts_api.dart';
import 'comunidad/posts_controller.dart';
import 'config/api_config.dart';
import 'sync/network_status.dart';
import 'sync/sqlite_local_store.dart';
import 'sync/sync_api.dart';
import 'sync/sync_controller.dart';
import 'sync/sync_engine.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  ApiConfig.assertReleaseUsesHttps();
  final store = SecureTokenStore();
  final client = SessionClient(store: store, baseUrl: ApiConfig.baseUrl);
  final auth = AuthController(store: store, api: AuthApi(client));
  final local = await SqliteLocalStore.open();
  final sync = SyncController(
    engine: SyncEngine(store: local, api: SyncApi(client)),
    auth: auth,
    network: ConnectivityNetworkStatus(),
  );
  final posts = PostsController(
    sync: sync,
    api: PostsApi(client),
    photos: ImagePickerPhotoSource(),
  );
  runApp(AgroTechApp(auth: auth, sync: sync, posts: posts));
  unawaited(auth.restore());
}
