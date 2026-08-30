import 'dart:convert';

import 'models.dart';

/// Reads JWT claims without verifying the signature. The API is the
/// source of truth; this is only used to persist `sub` / `role` after login.
Session sessionFromTokens(IssuedTokens tokens, DateTime now) {
  final claims = _decodeClaims(tokens.accessToken);
  final role = AppRoleX.fromApi(claims['role'] as String?);
  final sub = claims['sub'] as String?;
  if (role == null || sub == null) {
    throw const FormatException('Invalid token');
  }
  return Session(
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    accessExpiresAt: now.add(Duration(seconds: tokens.expiresIn)),
    sub: sub,
    role: role,
    entityType: EntityTypeX.fromApi(claims['entityType'] as String?),
  );
}

Map<String, dynamic> _decodeClaims(String token) {
  final parts = token.split('.');
  if (parts.length != 3) {
    throw const FormatException('Invalid token');
  }
  final normalized = base64Url.normalize(parts[1]);
  final payload = utf8.decode(base64Url.decode(normalized));
  return jsonDecode(payload) as Map<String, dynamic>;
}
