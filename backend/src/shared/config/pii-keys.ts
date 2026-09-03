import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const PII_KEY_MIN_LENGTH = 32;
export const DEV_PEPPER_FALLBACK = 'dev-pepper';

export function isProductionEnv(nodeEnv: string | undefined): boolean {
  return nodeEnv === 'production';
}

export function isStrongPiiSecret(value: string): boolean {
  return value.length >= PII_KEY_MIN_LENGTH;
}

export function requirePiiKeys(config: ConfigService): {
  pepper: string;
  encKey: string;
} {
  const nodeEnv = config.get<string>('NODE_ENV');
  const pepper = config.get<string>('PII_HASH_PEPPER')?.trim() ?? '';
  const encKey = config.get<string>('PII_ENCRYPTION_KEY')?.trim() ?? '';
  if (isProductionEnv(nodeEnv)) {
    if (
      !isStrongPiiSecret(pepper) ||
      pepper === DEV_PEPPER_FALLBACK ||
      !isStrongPiiSecret(encKey)
    ) {
      throw new ServiceUnavailableException('PII keys unavailable');
    }
    return { pepper, encKey };
  }
  if (!pepper || !encKey) {
    throw new ServiceUnavailableException('PII keys unavailable');
  }
  return { pepper, encKey };
}

export function resolvePepper(config: ConfigService): string {
  const nodeEnv = config.get<string>('NODE_ENV');
  const pepper = config.get<string>('PII_HASH_PEPPER')?.trim() ?? '';
  if (isProductionEnv(nodeEnv)) {
    if (!isStrongPiiSecret(pepper) || pepper === DEV_PEPPER_FALLBACK) {
      throw new ServiceUnavailableException('PII keys unavailable');
    }
    return pepper;
  }
  return pepper || DEV_PEPPER_FALLBACK;
}
