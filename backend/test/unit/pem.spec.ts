import { generateKeyPairSync } from 'node:crypto';
import {
  assertJwtRsaKeys,
  assertRsaPem,
  pemFromEnv,
} from '../../src/shared/config/pem';

function rsa(bits: number): { publicKey: string; privateKey: string } {
  return generateKeyPairSync('rsa', {
    modulusLength: bits,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

describe('pem', () => {
  it('unescapes literal \\n in env PEMs', () => {
    const { publicKey } = rsa(2048);
    const escaped = publicKey.replace(/\n/g, '\\n');
    expect(pemFromEnv(escaped)).toBe(publicKey.trim());
  });

  it('accepts RSA 2048', () => {
    const { publicKey, privateKey } = rsa(2048);
    expect(() => assertRsaPem(publicKey)).not.toThrow();
    expect(() => assertJwtRsaKeys(privateKey, publicKey)).not.toThrow();
  });

  it('rejects RSA 1024', () => {
    const { publicKey, privateKey } = rsa(1024);
    expect(() => assertRsaPem(publicKey)).toThrow(/modulus too small/);
    expect(() => assertJwtRsaKeys(privateKey, publicKey)).toThrow(
      /modulus too small/,
    );
  });

  it('rejects mismatched RSA key pairs', () => {
    const a = rsa(2048);
    const b = rsa(2048);
    expect(() => assertJwtRsaKeys(a.privateKey, b.publicKey)).toThrow(
      /mismatch/,
    );
  });

  it('rejects missing JWT keys', () => {
    expect(() => assertJwtRsaKeys(undefined, undefined)).toThrow(
      'JWT keys unavailable',
    );
  });
});
