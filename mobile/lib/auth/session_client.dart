import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../config/api_config.dart';
import 'jwt.dart';
import 'models.dart';
import 'token_store.dart';

typedef Now = DateTime Function();

/// HTTP client with transparent access-token refresh (single-flight).
class SessionClient {
  SessionClient({
    required this.store,
    required this.baseUrl,
    http.Client? httpClient,
    this.timeout = ApiConfig.timeout,
    this.now = DateTime.now,
    this.refreshSkew = ApiConfig.refreshSkew,
  }) : _http = httpClient ?? http.Client();

  final TokenStore store;
  final String baseUrl;
  final Duration timeout;
  final Now now;
  final Duration refreshSkew;
  final http.Client _http;

  Future<void>? _refreshing;

  Future<http.Response> post(
    String path, {
    Map<String, dynamic>? body,
    bool auth = false,
  }) {
    return _send(
      method: 'POST',
      path: path,
      body: body,
      auth: auth,
    );
  }

  Future<http.Response> get(String path, {bool auth = false}) {
    return _send(method: 'GET', path: path, auth: auth);
  }

  Future<void> persistTokens(IssuedTokens tokens) {
    return store.write(sessionFromTokens(tokens, now().toUtc()));
  }

  Future<Session?> readSession() => store.read();

  Future<void> clear() => store.clear();

  Future<http.Response> _send({
    required String method,
    required String path,
    Map<String, dynamic>? body,
    required bool auth,
    bool retry = true,
  }) async {
    if (auth) {
      await ensureFreshAccess();
    }
    final session = auth ? await store.read() : null;
    http.Response response;
    try {
      response = await _dispatch(method, path, body, session?.accessToken);
    } on SocketException {
      throw const NetworkException();
    } on TimeoutException {
      throw const NetworkException();
    } on http.ClientException {
      throw const NetworkException();
    }

    if (auth && retry && response.statusCode == 401) {
      final refreshed = await refresh();
      if (refreshed) {
        return _send(
          method: method,
          path: path,
          body: body,
          auth: true,
          retry: false,
        );
      }
    }
    return response;
  }

  Future<http.Response> _dispatch(
    String method,
    String path,
    Map<String, dynamic>? body,
    String? accessToken,
  ) {
    final uri = Uri.parse('$baseUrl$path');
    final headers = <String, String>{
      'Accept': 'application/json',
      if (body != null) 'Content-Type': 'application/json',
      if (accessToken != null) 'Authorization': 'Bearer $accessToken',
    };
    final encoded = body == null ? null : jsonEncode(body);
    if (method == 'GET') {
      return _http.get(uri, headers: headers).timeout(timeout);
    }
    return _http
        .post(uri, headers: headers, body: encoded)
        .timeout(timeout);
  }

  Future<void> ensureFreshAccess() async {
    final session = await store.read();
    if (session == null) {
      return;
    }
    if (!session.isAccessExpiring(now().toUtc(), refreshSkew)) {
      return;
    }
    await refresh();
  }

  /// Rotates the refresh token. Concurrent callers share one in-flight request
  /// so Redis `GETDEL` is not raced.
  Future<bool> refresh() async {
    if (_refreshing != null) {
      await _refreshing;
      return (await store.read()) != null;
    }
    final done = Completer<void>();
    _refreshing = done.future;
    try {
      final session = await store.read();
      if (session == null) {
        return false;
      }
      http.Response response;
      try {
        response = await _dispatch('POST', '/auth/refresh', {
          'refreshToken': session.refreshToken,
        }, null);
      } on SocketException {
        throw const NetworkException();
      } on TimeoutException {
        throw const NetworkException();
      } on http.ClientException {
        throw const NetworkException();
      }
      if (response.statusCode != 200) {
        await store.clear();
        return false;
      }
      final tokens = IssuedTokens.fromJson(_jsonObject(response));
      await persistTokens(tokens);
      return true;
    } finally {
      done.complete();
      _refreshing = null;
    }
  }
}

Map<String, dynamic> decodeJsonObject(http.Response response) {
  return _jsonObject(response);
}

void throwIfError(http.Response response) {
  if (response.statusCode >= 200 && response.statusCode < 300) {
    return;
  }
  throw parseApiException(response);
}

ApiException parseApiException(http.Response response) {
  var code = 'INTERNAL';
  var message = 'Request failed';
  try {
    final json = _jsonObject(response);
    final error = json['error'];
    if (error is Map<String, dynamic>) {
      code = error['code'] as String? ?? code;
      message = error['message'] as String? ?? message;
    }
  } on FormatException {
    // Keep generic fields. Do not attach the raw body (may contain PII).
  }
  return ApiException(
    status: response.statusCode,
    code: code,
    message: message,
  );
}

Map<String, dynamic> _jsonObject(http.Response response) {
  if (response.body.isEmpty) {
    return {};
  }
  final decoded = jsonDecode(response.body);
  if (decoded is Map<String, dynamic>) {
    return decoded;
  }
  throw const FormatException('Invalid JSON');
}
