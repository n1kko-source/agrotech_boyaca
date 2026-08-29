import { createHmac } from 'node:crypto';

/** Colombian mobile E.164: +57 3XX XXX XXXX */
export const CO_MOBILE_E164 = /^\+573\d{9}$/;

export function normalizeCoMobile(phone: string): string | null {
  const compact = phone.replace(/[\s-]/g, '');
  if (!CO_MOBILE_E164.test(compact)) {
    return null;
  }
  return compact;
}

export function phoneLookupHash(phoneE164: string, pepper: string): string {
  return createHmac('sha256', pepper).update(phoneE164).digest('hex');
}
