import 'package:agrotech_boyaca/auth/nit.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('accepts formatted NIT with valid check digit', () {
    expect(normalizeNit('800.197.268-4'), '8001972684');
    expect(normalizeNit('800197268-4'), '8001972684');
    expect(normalizeNit('8001972684'), '8001972684');
  });

  test('rejects wrong check digit', () {
    expect(normalizeNit('800197268-5'), isNull);
  });
}
