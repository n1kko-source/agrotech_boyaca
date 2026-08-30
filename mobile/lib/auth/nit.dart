/// DIAN check-digit weights, applied right-to-left excluding the DV.
const List<int> _nitWeights = [
  3,
  7,
  13,
  17,
  19,
  23,
  29,
  37,
  41,
  43,
  47,
  53,
  59,
  67,
  71,
];

int nitCheckDigit(String body) {
  var sum = 0;
  final digits = body.split('').reversed.toList();
  for (var i = 0; i < digits.length; i += 1) {
    if (i >= _nitWeights.length) {
      return -1;
    }
    sum += int.parse(digits[i]) * _nitWeights[i];
  }
  final remainder = sum % 11;
  return remainder > 1 ? 11 - remainder : remainder;
}

/// Normalizes to digits including DV. Accepts `800.197.268-4` or `8001972684`.
String? normalizeNit(String raw) {
  final compact = raw.replaceAll(RegExp(r'[.\s]'), '');
  final match = RegExp(r'^(\d{5,10})-?(\d)$').firstMatch(compact);
  if (match == null) {
    return null;
  }
  final body = match.group(1)!;
  final dv = match.group(2)!;
  if (nitCheckDigit(body) != int.parse(dv)) {
    return null;
  }
  return '$body$dv';
}
