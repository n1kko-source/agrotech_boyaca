enum AppRole { natural, juridica }

enum EntityType { asociacion, cooperativa, empresa }

enum AuthPhase { bootstrapping, guest, pendingJuridica, signedIn }

class IssuedTokens {
  const IssuedTokens({
    required this.accessToken,
    required this.refreshToken,
    required this.expiresIn,
  });

  final String accessToken;
  final String refreshToken;
  final int expiresIn;

  factory IssuedTokens.fromJson(Map<String, dynamic> json) {
    return IssuedTokens(
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
      expiresIn: json['expiresIn'] as int,
    );
  }
}

class Session {
  const Session({
    required this.accessToken,
    required this.refreshToken,
    required this.accessExpiresAt,
    required this.sub,
    required this.role,
    this.entityType,
  });

  final String accessToken;
  final String refreshToken;
  final DateTime accessExpiresAt;
  final String sub;
  final AppRole role;
  final EntityType? entityType;

  bool isAccessExpiring(DateTime now, Duration skew) {
    return !accessExpiresAt.subtract(skew).isAfter(now);
  }

  Map<String, String> toStorage() {
    return {
      'accessToken': accessToken,
      'refreshToken': refreshToken,
      'accessExpiresAt': accessExpiresAt.toUtc().toIso8601String(),
      'sub': sub,
      'role': role.apiValue,
      if (entityType != null) 'entityType': entityType!.apiValue,
    };
  }

  static Session? fromStorage(Map<String, String> raw) {
    final access = raw['accessToken'];
    final refresh = raw['refreshToken'];
    final exp = raw['accessExpiresAt'];
    final sub = raw['sub'];
    final role = AppRoleX.fromApi(raw['role']);
    if (access == null ||
        refresh == null ||
        exp == null ||
        sub == null ||
        role == null) {
      return null;
    }
    final expiresAt = DateTime.tryParse(exp);
    if (expiresAt == null) {
      return null;
    }
    return Session(
      accessToken: access,
      refreshToken: refresh,
      accessExpiresAt: expiresAt.toUtc(),
      sub: sub,
      role: role,
      entityType: EntityTypeX.fromApi(raw['entityType']),
    );
  }
}

class PrivacyPolicy {
  const PrivacyPolicy({
    required this.version,
    required this.title,
    required this.acceptLabel,
    required this.markdown,
  });

  final String version;
  final String title;
  final String acceptLabel;
  final String markdown;

  factory PrivacyPolicy.fromJson(Map<String, dynamic> json) {
    return PrivacyPolicy(
      version: json['version'] as String,
      title: json['title'] as String,
      acceptLabel: json['acceptLabel'] as String,
      markdown: json['markdown'] as String,
    );
  }

  static const fallback = PrivacyPolicy(
    version: '2026-08-30',
    title: 'Política de Tratamiento de Datos Personales',
    acceptLabel: 'Acepto la Política de Tratamiento de Datos Personales',
    markdown: '',
  );
}

class MeUser {
  const MeUser({required this.sub, required this.role, this.entityType});

  final String sub;
  final AppRole role;
  final EntityType? entityType;

  factory MeUser.fromJson(Map<String, dynamic> json) {
    final role = AppRoleX.fromApi(json['role'] as String?);
    if (role == null) {
      throw const FormatException('Invalid role');
    }
    return MeUser(
      sub: json['sub'] as String,
      role: role,
      entityType: EntityTypeX.fromApi(json['entityType'] as String?),
    );
  }
}

class ApiException implements Exception {
  const ApiException({
    required this.status,
    required this.code,
    required this.message,
  });

  final int status;
  final String code;
  final String message;

  bool get isForbidden => status == 403 || code == 'FORBIDDEN';

  bool get isUnauthorized => status == 401 || code == 'UNAUTHORIZED';

  bool get isThrottled => status == 429 || code == 'THROTTLED';

  bool get isConflict => status == 409 || code == 'CONFLICT';

  @override
  String toString() => 'ApiException($status $code)';
}

class PendingVerificationException implements Exception {
  const PendingVerificationException();
}

class NetworkException implements Exception {
  const NetworkException();
}

extension AppRoleX on AppRole {
  String get apiValue => switch (this) {
    AppRole.natural => 'NATURAL',
    AppRole.juridica => 'JURIDICA',
  };

  static AppRole? fromApi(String? value) {
    return switch (value) {
      'NATURAL' => AppRole.natural,
      'JURIDICA' => AppRole.juridica,
      _ => null,
    };
  }
}

extension EntityTypeX on EntityType {
  String get apiValue => switch (this) {
    EntityType.asociacion => 'asociacion',
    EntityType.cooperativa => 'cooperativa',
    EntityType.empresa => 'empresa',
  };

  String get label => switch (this) {
    EntityType.asociacion => 'Asociación',
    EntityType.cooperativa => 'Cooperativa',
    EntityType.empresa => 'Empresa',
  };

  static EntityType? fromApi(String? value) {
    return switch (value) {
      'asociacion' => EntityType.asociacion,
      'cooperativa' => EntityType.cooperativa,
      'empresa' => EntityType.empresa,
      _ => null,
    };
  }
}
