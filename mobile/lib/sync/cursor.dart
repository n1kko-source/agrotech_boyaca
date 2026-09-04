import 'dart:convert';

String encodeFeedCursor({required String id, required int t}) {
  return base64Url
      .encode(utf8.encode(jsonEncode({'id': id, 't': t})))
      .replaceAll('=', '');
}

({String id, int t})? decodeFeedCursor(String? cursor) {
  if (cursor == null || cursor.isEmpty) {
    return null;
  }
  try {
    final pad = (4 - cursor.length % 4) % 4;
    final padded = cursor.padRight(cursor.length + pad, '=');
    final decoded = jsonDecode(utf8.decode(base64Url.decode(padded)));
    if (decoded is! Map<String, dynamic>) {
      return null;
    }
    final id = decoded['id'];
    final t = decoded['t'];
    if (id is! String || t is! num) {
      return null;
    }
    return (id: id, t: t.toInt());
  } catch (_) {
    return null;
  }
}
