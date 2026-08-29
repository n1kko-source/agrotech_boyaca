import { createHmac } from 'node:crypto';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length < 5 || email.length > 254 || !EMAIL_RE.test(email)) {
    return null;
  }
  return email;
}

export function emailLookupHash(email: string, pepper: string): string {
  return createHmac('sha256', pepper).update(email).digest('hex');
}
