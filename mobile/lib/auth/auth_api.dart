import 'models.dart';
import 'session_client.dart';

abstract class AuthGateway {
  Future<String?> sendOtp(String phone);

  Future<IssuedTokens> verifyOtp({
    required String phone,
    required String code,
    required bool acceptPrivacyPolicy,
  });

  Future<void> registerJuridica({
    required String email,
    required String password,
    required String nit,
    required EntityType entityType,
    required bool acceptPrivacyPolicy,
  });

  Future<IssuedTokens> loginJuridica({
    required String email,
    required String password,
  });

  Future<void> resendJuridicaVerification({
    required String email,
    required String password,
  });

  Future<MeUser> me();

  Future<void> logout();

  Future<PrivacyPolicy> privacyPolicy();
}

class AuthApi implements AuthGateway {
  AuthApi(this.client);

  final SessionClient client;

  @override
  Future<String?> sendOtp(String phone) async {
    final response = await client.post('/auth/otp/send', body: {'phone': phone});
    throwIfError(response);
    final code = decodeJsonObject(response)['devCode'];
    return code is String && RegExp(r'^\d{6}$').hasMatch(code) ? code : null;
  }

  @override
  Future<IssuedTokens> verifyOtp({
    required String phone,
    required String code,
    required bool acceptPrivacyPolicy,
  }) async {
    final response = await client.post(
      '/auth/otp/verify',
      body: {
        'phone': phone,
        'code': code,
        'acceptPrivacyPolicy': acceptPrivacyPolicy,
      },
    );
    throwIfError(response);
    final tokens = IssuedTokens.fromJson(decodeJsonObject(response));
    await client.persistTokens(tokens);
    return tokens;
  }

  @override
  Future<void> registerJuridica({
    required String email,
    required String password,
    required String nit,
    required EntityType entityType,
    required bool acceptPrivacyPolicy,
  }) async {
    final response = await client.post(
      '/auth/register/juridica',
      body: {
        'email': email,
        'password': password,
        'nit': nit,
        'entityType': entityType.apiValue,
        'acceptPrivacyPolicy': acceptPrivacyPolicy,
      },
    );
    throwIfError(response);
  }

  @override
  Future<IssuedTokens> loginJuridica({
    required String email,
    required String password,
  }) async {
    final response = await client.post(
      '/auth/login/juridica',
      body: {'email': email, 'password': password},
    );
    if (response.statusCode == 403) {
      throw const PendingVerificationException();
    }
    throwIfError(response);
    final tokens = IssuedTokens.fromJson(decodeJsonObject(response));
    await client.persistTokens(tokens);
    return tokens;
  }

  @override
  Future<void> resendJuridicaVerification({
    required String email,
    required String password,
  }) async {
    final response = await client.post(
      '/auth/register/juridica/resend',
      body: {'email': email, 'password': password},
    );
    throwIfError(response);
  }

  @override
  Future<MeUser> me() async {
    final response = await client.get('/auth/me', auth: true);
    throwIfError(response);
    return MeUser.fromJson(decodeJsonObject(response));
  }

  @override
  Future<void> logout() async {
    final session = await client.readSession();
    final refresh = session?.refreshToken;
    try {
      if (refresh != null) {
        final response = await client.post(
          '/auth/logout',
          body: {'refreshToken': refresh},
        );
        throwIfError(response);
      }
    } on NetworkException {
      // Local session still drops; the refresh expires on its own TTL.
    } finally {
      await client.clear();
    }
  }

  @override
  Future<PrivacyPolicy> privacyPolicy() async {
    final response = await client.get('/legal/privacy-policy');
    throwIfError(response);
    return PrivacyPolicy.fromJson(decodeJsonObject(response));
  }
}
