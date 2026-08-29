import { normalizeCoMobile, phoneLookupHash } from '../../src/auth/phone/phone';

describe('phone helpers', () => {
  it('accepts Colombian mobile E.164', () => {
    expect(normalizeCoMobile('+573001234567')).toBe('+573001234567');
    expect(normalizeCoMobile('+57 300 123 4567')).toBe('+573001234567');
  });

  it('rejects landlines and non-CO numbers', () => {
    expect(normalizeCoMobile('+576012345678')).toBeNull();
    expect(normalizeCoMobile('+15551234567')).toBeNull();
    expect(normalizeCoMobile('3001234567')).toBeNull();
  });

  it('hashes lookup with HMAC (not reversible to the phone)', () => {
    const hash = phoneLookupHash('+573001234567', 'pepper');
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain('300');
    expect(phoneLookupHash('+573001234567', 'other')).not.toBe(hash);
  });
});
