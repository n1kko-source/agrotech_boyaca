import 'package:flutter/foundation.dart';

/// API host. Override at build/run:
/// `flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000`
class ApiConfig {
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://agrotech-8p9b.onrender.com',
  );

  static const Duration timeout = Duration(seconds: 20);

  /// Refresh the access token this far before `exp`.
  static const Duration refreshSkew = Duration(seconds: 30);

  /// Matches backend `OTP_COOLDOWN_SECONDS`.
  static const int otpCooldownSeconds = 60;

  /// Release APKs must talk HTTPS. Debug may use `http://10.0.2.2:3000`.
  static void assertReleaseUsesHttps({
    bool isRelease = kReleaseMode,
    String url = baseUrl,
  }) {
    if (isRelease && !url.startsWith('https://')) {
      throw StateError('Release builds require an HTTPS API_BASE_URL');
    }
  }
}
