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
  'cookie',
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
];
