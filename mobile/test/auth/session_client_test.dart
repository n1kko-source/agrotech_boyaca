import 'dart:convert';

import 'package:agrotech_boyaca/auth/models.dart';
import 'package:agrotech_boyaca/auth/session_client.dart';
import 'package:agrotech_boyaca/auth/token_store.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import '../helpers/fake_auth.dart';

void main() {
  test('refreshes once when two authed calls get 401', () async {
    var refreshCalls = 0;
    var meCalls = 0;
    final store = MemoryTokenStore();
    await store.write(
      Session(
        accessToken: 'expired-access',
        refreshToken: 'refresh-token-value-16',
        accessExpiresAt: DateTime.utc(2026, 8, 30, 13),
        sub: 'user-1',
        role: AppRole.natural,
      ),
    );

    final mock = MockClient((request) async {
      if (request.url.path == '/auth/refresh') {
        refreshCalls += 1;
        return http.Response(
          jsonEncode({
            'accessToken': fakeJwt(),
            'refreshToken': 'rotated-refresh-token',
            'expiresIn': 900,
            'tokenType': 'Bearer',
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (request.url.path == '/auth/me') {
        meCalls += 1;
        final auth = request.headers['Authorization'];
        if (auth == 'Bearer expired-access') {
          return http.Response(
            jsonEncode({
              'error': {'code': 'UNAUTHORIZED', 'message': 'Unauthorized'},
            }),
            401,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          jsonEncode({'sub': 'user-1', 'role': 'NATURAL'}),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.Response('not found', 404);
    });

    final client = SessionClient(
      store: store,
      baseUrl: 'https://agrotech-8p9b.onrender.com',
      httpClient: mock,
      now: () => DateTime.utc(2026, 8, 30, 12),
      refreshSkew: const Duration(seconds: 30),
    );

    final results = await Future.wait([
      client.get('/auth/me', auth: true),
      client.get('/auth/me', auth: true),
    ]);

    expect(results.every((r) => r.statusCode == 200), isTrue);
    expect(refreshCalls, 1);
    expect(meCalls, greaterThanOrEqualTo(2));
    final session = await store.read();
    expect(session?.refreshToken, 'rotated-refresh-token');
  });

  test('proactively refreshes when access is inside the skew window', () async {
    var refreshCalls = 0;
    final store = MemoryTokenStore();
    await store.write(
      Session(
        accessToken: 'almost-expired',
        refreshToken: 'refresh-token-value-16',
        accessExpiresAt: DateTime.utc(2026, 8, 30, 12, 0, 20),
        sub: 'user-1',
        role: AppRole.natural,
      ),
    );

    final mock = MockClient((request) async {
      if (request.url.path == '/auth/refresh') {
        refreshCalls += 1;
        return http.Response(
          jsonEncode({
            'accessToken': fakeJwt(),
            'refreshToken': 'new-refresh',
            'expiresIn': 900,
            'tokenType': 'Bearer',
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      expect(request.headers['Authorization'], isNot('Bearer almost-expired'));
      return http.Response(
        jsonEncode({'sub': 'user-1', 'role': 'NATURAL'}),
        200,
        headers: {'content-type': 'application/json'},
      );
    });

    final client = SessionClient(
      store: store,
      baseUrl: 'https://agrotech-8p9b.onrender.com',
      httpClient: mock,
      now: () => DateTime.utc(2026, 8, 30, 12),
      refreshSkew: const Duration(seconds: 30),
    );

    final response = await client.get('/auth/me', auth: true);
    expect(response.statusCode, 200);
    expect(refreshCalls, 1);
  });
}
