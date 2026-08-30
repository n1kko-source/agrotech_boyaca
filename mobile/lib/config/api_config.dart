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
}
