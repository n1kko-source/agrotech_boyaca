import {
  checkDigit,
  normalizeNit,
  nitLookupHash,
} from '../../src/auth/nit/nit';

describe('nit helpers', () => {
  it('accepts DIAN NIT with punctuation and validates DV', () => {
    expect(normalizeNit('800.197.268-4')).toBe('8001972684');
    expect(normalizeNit('800197268-4')).toBe('8001972684');
    expect(normalizeNit('8001972684')).toBe('8001972684');
    expect(checkDigit('800197268')).toBe(4);
  });

  it('rejects invalid check digits and non-numeric values', () => {
    expect(normalizeNit('800197268-5')).toBeNull();
    expect(normalizeNit('ABC')).toBeNull();
    expect(normalizeNit('123')).toBeNull();
  });

  it('hashes lookup with HMAC (not reversible to the NIT)', () => {
    const hash = nitLookupHash('8001972684', 'pepper');
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain('800197268');
    expect(nitLookupHash('8001972684', 'other')).not.toBe(hash);
  });
});
