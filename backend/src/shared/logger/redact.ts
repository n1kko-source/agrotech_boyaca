const REDACTED = '[Redacted]';

const SENSITIVE_KEYS = new Set([
  'phone',
  'telefono',
  'tel',
  'nit',
  'email',
  'authorization',
  'password',
  'database_url',
  'direct_url',
  'redis_url',
  'private_key',
  'firebase_private_key',
  'firebase_web_api_key',
  'pii_encryption_key',
  'pii_hash_pepper',
  'jwt_private_key',
  'openweather_api_key',
  'clima_job_secret',
  'suscripciones_job_secret',
  'r2_secret_access_key',
  'r2_access_key_id',
  'fcmtoken',
  'refreshtoken',
  'refresh_token',
  'accesstoken',
  'otpcode',
  'cookie',
  'reference',
]);

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase());
}

export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item));
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, nested]) => [
        key,
        isSensitiveKey(key) ? REDACTED : redactSensitive(nested),
      ],
    );
    return Object.fromEntries(entries);
  }
  return value;
}

export const PINO_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  '*.phone',
  '*.telefono',
  '*.tel',
  '*.nit',
  '*.email',
  '*.password',
  '*.DATABASE_URL',
  '*.DIRECT_URL',
  '*.REDIS_URL',
  '*.private_key',
  '*.FIREBASE_PRIVATE_KEY',
  '*.FIREBASE_WEB_API_KEY',
  '*.PII_ENCRYPTION_KEY',
  '*.PII_HASH_PEPPER',
  '*.JWT_PRIVATE_KEY',
  '*.refreshToken',
  '*.accessToken',
  'req.body.phone',
  'req.body.code',
  'req.body.email',
  'req.body.password',
  'req.body.nit',
  'req.body.recaptchaToken',
  'req.body.playIntegrityToken',
  'req.body.fcmToken',
  'req.body.body',
  'req.body.ops[*].payload.body',
  'req.body.reference',
  '*.fcmToken',
  '*.OPENWEATHER_API_KEY',
  '*.CLIMA_JOB_SECRET',
  '*.SUSCRIPCIONES_JOB_SECRET',
  '*.R2_SECRET_ACCESS_KEY',
  '*.R2_ACCESS_KEY_ID',
  'req.headers.x-clima-job-secret',
  'req.headers.x-suscripciones-job-secret',
];
