enum SyncEntity { post, profile, conversation, message, alerta, precio }

enum SyncOpStatus { applied, conflict, rejected }

enum SyncUiStatus { offline, syncing, synced }

extension SyncEntityX on SyncEntity {
  String get apiValue => name;

  static SyncEntity? fromApi(String? value) {
    return switch (value) {
      'post' => SyncEntity.post,
      'profile' => SyncEntity.profile,
      'conversation' => SyncEntity.conversation,
      'message' => SyncEntity.message,
      'alerta' => SyncEntity.alerta,
      'precio' => SyncEntity.precio,
      _ => null,
    };
  }
}

extension SyncOpStatusX on SyncOpStatus {
  static SyncOpStatus? fromApi(String? value) {
    return switch (value) {
      'applied' => SyncOpStatus.applied,
      'conflict' => SyncOpStatus.conflict,
      'rejected' => SyncOpStatus.rejected,
      _ => null,
    };
  }
}

class LocalPost {
  const LocalPost({
    required this.id,
    required this.authorId,
    required this.title,
    required this.description,
    required this.category,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String authorId;
  final String title;
  final String description;
  final String category;
  final DateTime createdAt;
  final DateTime updatedAt;

  factory LocalPost.fromJson(Map<String, dynamic> json) {
    final created = readDate(json, 'createdAt') ?? DateTime.now().toUtc();
    return LocalPost(
      id: readString(json, 'id'),
      authorId: readString(json, 'authorId'),
      title: readString(json, 'title'),
      description: readString(json, 'description'),
      category: readString(json, 'category'),
      createdAt: created,
      updatedAt: readDate(json, 'updatedAt') ?? created,
    );
  }

  Map<String, Object?> toRow() => {
    'id': id,
    'author_id': authorId,
    'title': title,
    'description': description,
    'category': category,
    'created_at': createdAt.toUtc().toIso8601String(),
    'updated_at': updatedAt.toUtc().toIso8601String(),
  };

  static LocalPost fromRow(Map<String, Object?> row) {
    return LocalPost.fromJson(<String, dynamic>{
      'id': row['id'],
      'authorId': row['author_id'],
      'title': row['title'],
      'description': row['description'],
      'category': row['category'],
      'createdAt': row['created_at'],
      'updatedAt': row['updated_at'],
    });
  }

  LocalPost copyWith({
    String? title,
    String? description,
    String? category,
    DateTime? updatedAt,
  }) {
    return LocalPost(
      id: id,
      authorId: authorId,
      title: title ?? this.title,
      description: description ?? this.description,
      category: category ?? this.category,
      createdAt: createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}

class PagedPosts {
  const PagedPosts({required this.items, this.nextCursor});

  final List<LocalPost> items;
  final String? nextCursor;
}

class LocalProfile {
  const LocalProfile({
    required this.id,
    required this.userId,
    required this.displayName,
    required this.municipality,
    required this.bio,
    required this.category,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String userId;
  final String displayName;
  final String municipality;
  final String bio;
  final String category;
  final DateTime createdAt;
  final DateTime updatedAt;

  factory LocalProfile.fromJson(Map<String, dynamic> json) {
    final created = readDate(json, 'createdAt') ?? DateTime.now().toUtc();
    return LocalProfile(
      id: readString(json, 'id'),
      userId: readString(json, 'userId'),
      displayName: readString(json, 'displayName'),
      municipality: readString(json, 'municipality'),
      bio: optionalString(json, 'bio') ?? '',
      category: readString(json, 'category'),
      createdAt: created,
      updatedAt: readDate(json, 'updatedAt') ?? created,
    );
  }

  Map<String, Object?> toRow() => {
    'id': id,
    'user_id': userId,
    'display_name': displayName,
    'municipality': municipality,
    'bio': bio,
    'category': category,
    'created_at': createdAt.toUtc().toIso8601String(),
    'updated_at': updatedAt.toUtc().toIso8601String(),
  };

  static LocalProfile fromRow(Map<String, Object?> row) {
    return LocalProfile.fromJson(<String, dynamic>{
      'id': row['id'],
      'userId': row['user_id'],
      'displayName': row['display_name'],
      'municipality': row['municipality'],
      'bio': row['bio'],
      'category': row['category'],
      'createdAt': row['created_at'],
      'updatedAt': row['updated_at'],
    });
  }
}

class LocalConversation {
  const LocalConversation({
    required this.id,
    required this.postId,
    required this.initiatorId,
    required this.peerId,
    required this.createdAt,
  });

  final String id;
  final String postId;
  final String initiatorId;
  final String peerId;
  final DateTime createdAt;

  factory LocalConversation.fromJson(Map<String, dynamic> json) {
    return LocalConversation(
      id: readString(json, 'id'),
      postId: readString(json, 'postId'),
      initiatorId: readString(json, 'initiatorId'),
      peerId: optionalString(json, 'peerId') ?? '',
      createdAt: readDate(json, 'createdAt') ?? DateTime.now().toUtc(),
    );
  }

  Map<String, Object?> toRow() => {
    'id': id,
    'post_id': postId,
    'initiator_id': initiatorId,
    'peer_id': peerId,
    'created_at': createdAt.toUtc().toIso8601String(),
  };

  static LocalConversation fromRow(Map<String, Object?> row) {
    return LocalConversation.fromJson(<String, dynamic>{
      'id': row['id'],
      'postId': row['post_id'],
      'initiatorId': row['initiator_id'],
      'peerId': row['peer_id'],
      'createdAt': row['created_at'],
    });
  }
}

class LocalMessage {
  const LocalMessage({
    required this.id,
    required this.conversationId,
    required this.senderId,
    required this.body,
    required this.createdAt,
  });

  final String id;
  final String conversationId;
  final String senderId;
  final String body;
  final DateTime createdAt;

  factory LocalMessage.fromJson(Map<String, dynamic> json) {
    return LocalMessage(
      id: readString(json, 'id'),
      conversationId: readString(json, 'conversationId'),
      senderId: readString(json, 'senderId'),
      body: readString(json, 'body'),
      createdAt: readDate(json, 'createdAt') ?? DateTime.now().toUtc(),
    );
  }

  Map<String, Object?> toRow() => {
    'id': id,
    'conversation_id': conversationId,
    'sender_id': senderId,
    'body': body,
    'created_at': createdAt.toUtc().toIso8601String(),
  };

  static LocalMessage fromRow(Map<String, Object?> row) {
    return LocalMessage.fromJson(<String, dynamic>{
      'id': row['id'],
      'conversationId': row['conversation_id'],
      'senderId': row['sender_id'],
      'body': row['body'],
      'createdAt': row['created_at'],
    });
  }
}

class LocalPrice {
  const LocalPrice({
    required this.id,
    required this.producto,
    required this.region,
    required this.precio,
    required this.unidad,
    required this.moneda,
    required this.updatedAt,
  });

  final String id;
  final String producto;
  final String region;
  final double precio;
  final String unidad;
  final String moneda;
  final DateTime updatedAt;

  factory LocalPrice.fromJson(Map<String, dynamic> json) {
    return LocalPrice(
      id: optionalString(json, 'id') ?? '',
      producto: readString(json, 'producto'),
      region: readString(json, 'region'),
      precio: readDouble(json, 'precio'),
      unidad: optionalString(json, 'unidad') ?? 'kg',
      moneda: optionalString(json, 'moneda') ?? 'COP',
      updatedAt: readDate(json, 'updatedAt') ?? DateTime.now().toUtc(),
    );
  }

  Map<String, Object?> toRow() => {
    'id': id,
    'producto': producto,
    'region': region,
    'precio': precio,
    'unidad': unidad,
    'moneda': moneda,
    'updated_at': updatedAt.toUtc().toIso8601String(),
  };

  static LocalPrice fromRow(Map<String, Object?> row) {
    return LocalPrice.fromJson(<String, dynamic>{
      'id': row['id'],
      'producto': row['producto'],
      'region': row['region'],
      'precio': row['precio'],
      'unidad': row['unidad'],
      'moneda': row['moneda'],
      'updatedAt': row['updated_at'],
    });
  }
}

class LocalAlert {
  const LocalAlert({
    required this.id,
    required this.userId,
    required this.municipio,
    required this.kind,
    required this.enabled,
    required this.updatedAt,
  });

  final String id;
  final String userId;
  final String municipio;
  final String kind;
  final bool enabled;
  final DateTime updatedAt;

  factory LocalAlert.fromJson(Map<String, dynamic> json, {String? userId}) {
    return LocalAlert(
      id: readString(json, 'id'),
      userId: optionalString(json, 'userId') ?? userId ?? '',
      municipio: readString(json, 'municipio'),
      kind: readString(json, 'kind'),
      enabled: readBool(json, 'enabled', fallback: true),
      updatedAt: readDate(json, 'updatedAt') ?? DateTime.now().toUtc(),
    );
  }

  Map<String, Object?> toRow() => {
    'id': id,
    'user_id': userId,
    'municipio': municipio,
    'kind': kind,
    'enabled': enabled ? 1 : 0,
    'updated_at': updatedAt.toUtc().toIso8601String(),
  };

  static LocalAlert fromRow(Map<String, Object?> row) {
    return LocalAlert.fromJson(<String, dynamic>{
      'id': row['id'],
      'userId': row['user_id'],
      'municipio': row['municipio'],
      'kind': row['kind'],
      'enabled': row['enabled'],
      'updatedAt': row['updated_at'],
    });
  }
}

class PendingOp {
  const PendingOp({
    required this.opId,
    required this.userId,
    required this.entity,
    required this.entityId,
    required this.clientTs,
    required this.payload,
  });

  final String opId;
  final String userId;
  final SyncEntity entity;
  final String entityId;
  final DateTime clientTs;
  final Map<String, dynamic> payload;

  Map<String, dynamic> toApiJson() => {
    'opId': opId,
    'entity': entity.apiValue,
    'entityId': entityId,
    'clientTs': clientTs.toUtc().toIso8601String(),
    'payload': payload,
  };
}

class SyncOpResult {
  const SyncOpResult({
    required this.opId,
    required this.entity,
    required this.entityId,
    required this.status,
    this.reason,
    this.record,
  });

  final String opId;
  final SyncEntity entity;
  final String entityId;
  final SyncOpStatus status;
  final String? reason;
  final Map<String, dynamic>? record;

  factory SyncOpResult.fromJson(Map<String, dynamic> json) {
    final entity = SyncEntityX.fromApi(json['entity'] as String?);
    final status = SyncOpStatusX.fromApi(json['status'] as String?);
    if (entity == null || status == null) {
      throw const FormatException('Invalid sync result');
    }
    return SyncOpResult(
      opId: readString(json, 'opId'),
      entity: entity,
      entityId: readString(json, 'entityId'),
      status: status,
      reason: optionalString(json, 'reason'),
      record: asJsonMap(json['record']),
    );
  }
}

class SyncDelta {
  const SyncDelta({
    required this.posts,
    this.profile,
    required this.conversations,
    required this.messages,
    required this.alertas,
  });

  final List<LocalPost> posts;
  final LocalProfile? profile;
  final List<LocalConversation> conversations;
  final List<LocalMessage> messages;
  final List<LocalAlert> alertas;

  factory SyncDelta.fromJson(Map<String, dynamic> json, {String? userId}) {
    return SyncDelta(
      posts: parseList(json['posts'], LocalPost.fromJson),
      profile: _profile(json['profile']),
      conversations: parseList(
        json['conversations'],
        LocalConversation.fromJson,
      ),
      messages: parseList(json['messages'], LocalMessage.fromJson),
      alertas: parseList(
        json['alertas'],
        (row) => LocalAlert.fromJson(row, userId: userId),
      ),
    );
  }

  static LocalProfile? _profile(Object? raw) {
    final map = asJsonMap(raw);
    if (map == null) {
      return null;
    }
    return LocalProfile.fromJson(map);
  }
}

class SyncBatchResponse {
  const SyncBatchResponse({
    required this.serverTime,
    required this.results,
    required this.delta,
  });

  final String serverTime;
  final List<SyncOpResult> results;
  final SyncDelta delta;

  factory SyncBatchResponse.fromJson(
    Map<String, dynamic> json, {
    String? userId,
  }) {
    final resultsRaw = json['results'];
    final results = <SyncOpResult>[];
    if (resultsRaw is List) {
      for (final item in resultsRaw) {
        final map = asJsonMap(item);
        if (map == null) {
          continue;
        }
        try {
          results.add(SyncOpResult.fromJson(map));
        } on FormatException {
          // Skip a malformed row; do not drop the rest of the batch.
        }
      }
    }
    final deltaMap = asJsonMap(json['delta']) ?? {};
    return SyncBatchResponse(
      serverTime: readString(json, 'serverTime'),
      results: results,
      delta: SyncDelta.fromJson(deltaMap, userId: userId),
    );
  }
}

String readString(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is String) {
    return value;
  }
  throw FormatException('Missing $key');
}

String? optionalString(Map<String, dynamic> json, String key) {
  final value = json[key];
  return value is String ? value : null;
}

double readDouble(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is num) {
    return value.toDouble();
  }
  if (value is String) {
    return double.parse(value);
  }
  throw FormatException('Missing $key');
}

bool readBool(Map<String, dynamic> json, String key, {required bool fallback}) {
  final value = json[key];
  if (value is bool) {
    return value;
  }
  if (value is num) {
    return value != 0;
  }
  return fallback;
}

DateTime? readDate(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is! String || value.isEmpty) {
    return null;
  }
  return DateTime.parse(value).toUtc();
}

Map<String, dynamic>? asJsonMap(Object? raw) {
  if (raw is Map<String, dynamic>) {
    return raw;
  }
  if (raw is Map) {
    return Map<String, dynamic>.from(raw);
  }
  return null;
}

List<T> parseList<T>(Object? raw, T Function(Map<String, dynamic> json) parse) {
  if (raw is! List) {
    return <T>[];
  }
  final out = <T>[];
  for (final item in raw) {
    final map = asJsonMap(item);
    if (map == null) {
      continue;
    }
    try {
      out.add(parse(map));
    } on FormatException {
      // Partial delta must not abort the rest of the collections.
    }
  }
  return out;
}
