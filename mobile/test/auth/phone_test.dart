import 'package:agrotech_boyaca/auth/phone.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('normalizes 10-digit Colombian mobile to E.164', () {
    expect(normalizeCoMobile('3001112233'), '+573001112233');
    expect(normalizeCoMobile('300 111 2233'), '+573001112233');
    expect(normalizeCoMobile('+57 300 111 2233'), '+573001112233');
  });

  test('rejects landlines and foreign numbers', () {
    expect(normalizeCoMobile('6011234567'), isNull);
    expect(normalizeCoMobile('+15551234567'), isNull);
    expect(normalizeCoMobile('300111223'), isNull);
  });
}
