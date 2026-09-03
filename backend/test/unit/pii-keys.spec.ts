import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import {
  DEV_PEPPER_FALLBACK,
  requirePiiKeys,
  resolvePepper,
} from '../../src/shared/config/pii-keys';

const STRONG = 'a'.repeat(32);

function config(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as ConfigService;
}

describe('pii-keys', () => {
  it('falls back to dev-pepper outside production', () => {
    expect(
      resolvePepper(config({ NODE_ENV: 'test', PII_HASH_PEPPER: undefined })),
    ).toBe(DEV_PEPPER_FALLBACK);
    expect(
      resolvePepper(config({ NODE_ENV: 'development', PII_HASH_PEPPER: '' })),
    ).toBe(DEV_PEPPER_FALLBACK);
  });

  it('accepts a short pepper in development for Prisma writes if both keys exist', () => {
    expect(
      requirePiiKeys(
        config({
          NODE_ENV: 'test',
          PII_HASH_PEPPER: 'pepper',
          PII_ENCRYPTION_KEY: 'enc-key',
        }),
      ),
    ).toEqual({ pepper: 'pepper', encKey: 'enc-key' });
  });

  it('rejects missing or short keys in production', () => {
    expect(() =>
      requirePiiKeys(
        config({
          NODE_ENV: 'production',
          PII_HASH_PEPPER: 'short',
          PII_ENCRYPTION_KEY: STRONG,
        }),
      ),
    ).toThrow(ServiceUnavailableException);
    expect(() =>
      resolvePepper(
        config({
          NODE_ENV: 'production',
          PII_HASH_PEPPER: DEV_PEPPER_FALLBACK,
        }),
      ),
    ).toThrow(ServiceUnavailableException);
    expect(() => resolvePepper(config({ NODE_ENV: 'production' }))).toThrow(
      ServiceUnavailableException,
    );
  });

  it('accepts strong keys in production', () => {
    const keys = requirePiiKeys(
      config({
        NODE_ENV: 'production',
        PII_HASH_PEPPER: STRONG,
        PII_ENCRYPTION_KEY: `${STRONG}b`,
      }),
    );
    expect(keys.pepper).toHaveLength(32);
    expect(keys.encKey.length).toBeGreaterThanOrEqual(32);
  });
});
