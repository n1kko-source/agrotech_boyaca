import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'models.dart';
import 'token_store.dart';

const _keys = [
  'accessToken',
  'refreshToken',
  'accessExpiresAt',
  'sub',
  'role',
  'entityType',
];

class SecureTokenStore implements TokenStore {
  SecureTokenStore({FlutterSecureStorage? storage})
    : _storage =
          storage ??
          const FlutterSecureStorage(
            aOptions: AndroidOptions(encryptedSharedPreferences: true),
            iOptions: IOSOptions(
              accessibility: KeychainAccessibility.first_unlock_this_device,
            ),
          );

  final FlutterSecureStorage _storage;

  @override
  Future<Session?> read() async {
    final raw = <String, String>{};
    for (final key in _keys) {
      final value = await _storage.read(key: key);
      if (value != null && value.isNotEmpty) {
        raw[key] = value;
      }
    }
    return Session.fromStorage(raw);
  }

  @override
  Future<void> write(Session session) async {
    final raw = session.toStorage();
    for (final key in _keys) {
      final value = raw[key];
      if (value == null) {
        await _storage.delete(key: key);
      } else {
        await _storage.write(key: key, value: value);
      }
    }
  }

  @override
  Future<void> clear() async {
    for (final key in _keys) {
      await _storage.delete(key: key);
    }
  }
}
