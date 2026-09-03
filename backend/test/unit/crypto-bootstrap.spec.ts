import { ConfigService } from '@nestjs/config';
import { CryptoBootstrap } from '../../src/shared/config/crypto-bootstrap';
import { generateKeyPairSync } from 'node:crypto';

describe('CryptoBootstrap', () => {
  it('is a no-op outside production', () => {
    const boot = new CryptoBootstrap({
      get: () => 'test',
    } as unknown as ConfigService);
    expect(() => boot.onModuleInit()).not.toThrow();
  });

  it('fails closed in production without strong keys', () => {
    const boot = new CryptoBootstrap({
      get: (key: string) => {
        if (key === 'NODE_ENV') {
          return 'production';
        }
        return undefined;
      },
    } as ConfigService);
    expect(() => boot.onModuleInit()).toThrow();
  });

  it('accepts strong PII keys and RSA 2048 in production', () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const boot = new CryptoBootstrap({
      get: (key: string) => {
        if (key === 'NODE_ENV') {
          return 'production';
        }
        if (key === 'PII_HASH_PEPPER') {
          return 'p'.repeat(32);
        }
        if (key === 'PII_ENCRYPTION_KEY') {
          return 'e'.repeat(32);
        }
        if (key === 'JWT_PRIVATE_KEY') {
          return privateKey;
        }
        if (key === 'JWT_PUBLIC_KEY') {
          return publicKey;
        }
        return undefined;
      },
    } as ConfigService);
    expect(() => boot.onModuleInit()).not.toThrow();
  });
});
