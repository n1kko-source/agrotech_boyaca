import 'dart:convert';

import 'package:agrotech_boyaca/auth/auth_api.dart';
import 'package:agrotech_boyaca/auth/jwt.dart';
import 'package:agrotech_boyaca/auth/models.dart';
import 'package:agrotech_boyaca/auth/token_store.dart';

class FakeAuthGateway implements AuthGateway {
  FakeAuthGateway(this.store, {this.loginForbidden = false});

  final TokenStore store;
  bool loginForbidden;
  int sendOtpCalls = 0;
  int verifyCalls = 0;
  int registerCalls = 0;
  int loginCalls = 0;
  int resendCalls = 0;
  int logoutCalls = 0;
  int meCalls = 0;
  String? lastPhone;
  String? lastEmail;

  String? otpDevCode;

  @override
  Future<String?> sendOtp(String phone) async {
    sendOtpCalls += 1;
    lastPhone = phone;
    return otpDevCode;
  }

  @override
  Future<IssuedTokens> verifyOtp({
    required String phone,
    required String code,
    required bool acceptPrivacyPolicy,
  }) async {
    verifyCalls += 1;
    lastPhone = phone;
    if (!acceptPrivacyPolicy) {
      throw const ApiException(
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Privacy policy must be accepted',
      );
    }
    return _issue(role: AppRole.natural);
  }

  @override
  Future<void> registerJuridica({
    required String email,
    required String password,
    required String nit,
    required EntityType entityType,
    required bool acceptPrivacyPolicy,
  }) async {
    registerCalls += 1;
    lastEmail = email;
  }

  @override
  Future<IssuedTokens> loginJuridica({
    required String email,
    required String password,
  }) async {
    loginCalls += 1;
    lastEmail = email;
    if (loginForbidden) {
      throw const PendingVerificationException();
    }
    return _issue(
      role: AppRole.juridica,
      entityType: EntityType.cooperativa,
    );
  }

  @override
  Future<void> resendJuridicaVerification({
    required String email,
    required String password,
  }) async {
    resendCalls += 1;
    lastEmail = email;
  }

  @override
  Future<MeUser> me() async {
    meCalls += 1;
    final session = await store.read();
    return MeUser(
      sub: session?.sub ?? 'user-1',
      role: session?.role ?? AppRole.natural,
      entityType: session?.entityType,
    );
  }

  @override
  Future<void> logout() async {
    logoutCalls += 1;
    await store.clear();
  }

  @override
  Future<PrivacyPolicy> privacyPolicy() async => PrivacyPolicy.fallback;

  Future<IssuedTokens> _issue({
    required AppRole role,
    EntityType? entityType,
  }) async {
    final tokens = IssuedTokens(
      accessToken: fakeJwt(role: role, entityType: entityType),
      refreshToken: 'refresh-token-value-16',
      expiresIn: role == AppRole.natural ? 900 : 3600,
    );
    await store.write(sessionFromTokens(tokens, DateTime.now().toUtc()));
    return tokens;
  }
}

String fakeJwt({
  AppRole role = AppRole.natural,
  String sub = 'user-1',
  EntityType? entityType,
}) {
  final header = base64Url.encode(utf8.encode('{"alg":"none"}'));
  final payload = base64Url.encode(
    utf8.encode(
      jsonEncode({
        'sub': sub,
        'role': role.apiValue,
        if (entityType != null) 'entityType': entityType.apiValue,
        'exp': 9999999999,
      }),
    ),
  );
  return '$header.$payload.sig';
}
