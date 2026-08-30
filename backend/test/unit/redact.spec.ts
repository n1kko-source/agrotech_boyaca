import {
  isSensitiveKey,
  redactSensitive,
} from '../../src/shared/logger/redact';

describe('redactSensitive (Ley 1581)', () => {
  it('recognizes sensitive keys case-insensitively', () => {
    expect(isSensitiveKey('email')).toBe(true);
    expect(isSensitiveKey('NIT')).toBe(true);
    expect(isSensitiveKey('telefono')).toBe(true);
    expect(isSensitiveKey('fcmToken')).toBe(true);
    expect(isSensitiveKey('status')).toBe(false);
  });

  it('redacts nested PII and leaves other fields', () => {
    const redacted = redactSensitive({
      ok: true,
      email: 'user@example.com',
      nested: { nit: '900123', count: 2 },
    }) as Record<string, unknown>;

    expect(redacted.ok).toBe(true);
    expect(redacted.email).toBe('[Redacted]');
    expect(redacted.nested).toEqual({ nit: '[Redacted]', count: 2 });
  });
});
