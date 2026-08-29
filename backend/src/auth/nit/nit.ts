import { createHmac } from 'node:crypto';

/** DIAN check-digit weights, applied right-to-left excluding the DV. */
const NIT_WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

/**
 * Normalizes a Colombian NIT to digits including the verification digit.
 * Accepts `800.197.268-4`, `800197268-4`, or `8001972684`.
 */
export function normalizeNit(raw: string): string | null {
  const compact = raw.replace(/[.\s]/g, '');
  const match = compact.match(/^(\d{5,10})-?(\d)$/);
  if (!match) {
    return null;
  }
  const body = match[1];
  const dv = match[2];
  if (checkDigit(body) !== Number(dv)) {
    return null;
  }
  return `${body}${dv}`;
}

export function nitLookupHash(nitDigits: string, pepper: string): string {
  return createHmac('sha256', pepper).update(nitDigits).digest('hex');
}

export function checkDigit(nitBody: string): number {
  let sum = 0;
  const digits = nitBody.split('').reverse();
  for (let i = 0; i < digits.length; i += 1) {
    const weight = NIT_WEIGHTS[i];
    if (weight === undefined) {
      return -1;
    }
    sum += Number(digits[i]) * weight;
  }
  const remainder = sum % 11;
  return remainder > 1 ? 11 - remainder : remainder;
}
