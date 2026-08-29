import { emailLookupHash, normalizeEmail } from '../../src/auth/email/email';

describe('email helpers', () => {
  it('normalizes case and trims', () => {
    expect(normalizeEmail('  Coop@Example.COM ')).toBe('coop@example.com');
  });

  it('rejects malformed addresses', () => {
    expect(normalizeEmail('not-an-email')).toBeNull();
    expect(normalizeEmail('')).toBeNull();
  });

  it('hashes lookup with HMAC (not reversible to the email)', () => {
    const hash = emailLookupHash('coop@example.com', 'pepper');
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain('coop');
    expect(emailLookupHash('coop@example.com', 'other')).not.toBe(hash);
  });
});
