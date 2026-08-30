/// Colombian mobile E.164: +57 3XX XXX XXXX. Same rule as backend `CO_MOBILE_E164`.
final RegExp coMobileE164 = RegExp(r'^\+573\d{9}$');

/// Accepts `3001112233`, `300 111 2233`, `+57 300 111 2233`.
String? normalizeCoMobile(String raw) {
  var compact = raw.replaceAll(RegExp(r'[\s-]'), '');
  if (compact.startsWith('57') && compact.length == 12) {
    compact = '+$compact';
  } else if (compact.startsWith('3') && compact.length == 10) {
    compact = '+57$compact';
  }
  if (!coMobileE164.hasMatch(compact)) {
    return null;
  }
  return compact;
}
