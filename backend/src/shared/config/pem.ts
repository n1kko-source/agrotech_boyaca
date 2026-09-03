import { createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';

export const RSA_MIN_MODULUS_BITS = 2048;

/** Env PEMs are often stored with literal `\n` sequences. */
export function pemFromEnv(value: string | undefined): string | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  return value.replace(/\\n/g, '\n').trim();
}

export function assertRsaPem(
  pem: string,
  minBits: number = RSA_MIN_MODULUS_BITS,
): void {
  const key = parseAsymmetricKey(pem);
  if (key.asymmetricKeyType !== 'rsa') {
    throw new Error('JWT key must be RSA');
  }
  const bits = key.asymmetricKeyDetails?.modulusLength ?? 0;
  if (bits < minBits) {
    throw new Error('JWT RSA modulus too small');
  }
}

export function assertJwtRsaKeys(
  privatePem: string | undefined,
  publicPem: string | undefined,
): void {
  if (!privatePem || !publicPem) {
    throw new Error('JWT keys unavailable');
  }
  assertRsaPem(privatePem);
  assertRsaPem(publicPem);
  const derived = exportSpki(createPublicKey(createPrivateKey(privatePem)));
  const provided = exportSpki(createPublicKey(publicPem));
  if (derived !== provided) {
    throw new Error('JWT key pair mismatch');
  }
}

function exportSpki(key: KeyObject): string {
  return key.export({ type: 'spki', format: 'pem' }).toString();
}

function parseAsymmetricKey(pem: string): KeyObject {
  try {
    return createPrivateKey(pem);
  } catch {
    return createPublicKey(pem);
  }
}
