import 'dart:async';

import 'package:flutter/material.dart';

import 'app.dart';
import 'auth/auth_api.dart';
import 'auth/auth_controller.dart';
import 'auth/secure_token_store.dart';
import 'auth/session_client.dart';
import 'config/api_config.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final store = SecureTokenStore();
  final client = SessionClient(store: store, baseUrl: ApiConfig.baseUrl);
  final auth = AuthController(store: store, api: AuthApi(client));
  runApp(AgroTechApp(auth: auth));
  unawaited(auth.restore());
}
