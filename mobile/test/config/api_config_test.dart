import 'package:agrotech_boyaca/config/api_config.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('debug builds allow http emulator URLs', () {
    expect(
      () => ApiConfig.assertReleaseUsesHttps(
        isRelease: false,
        url: 'http://10.0.2.2:3000',
      ),
      returnsNormally,
    );
  });

  test('release builds require HTTPS', () {
    expect(
      () => ApiConfig.assertReleaseUsesHttps(
        isRelease: true,
        url: 'http://10.0.2.2:3000',
      ),
      throwsA(isA<StateError>()),
    );
    expect(
      () => ApiConfig.assertReleaseUsesHttps(
        isRelease: true,
        url: 'https://agrotech-8p9b.onrender.com',
      ),
      returnsNormally,
    );
  });
}
