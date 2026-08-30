import { createSign } from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

export type ServiceAccount = {
  clientEmail: string;
  privateKey: string;
};

export function googleAssertionJwt(
  account: ServiceAccount,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      iss: account.clientEmail,
      sub: account.clientEmail,
      aud: TOKEN_URL,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
      scope: FCM_SCOPE,
    }),
  );
  const unsigned = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  const signature = signer.sign(account.privateKey, 'base64url');
  return `${unsigned}.${signature}`;
}

export async function fetchGoogleAccessToken(
  account: ServiceAccount,
  fetchImpl: typeof fetch,
): Promise<{ accessToken: string; expiresAtMs: number }> {
  const assertion = googleAssertionJwt(account);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error('FCM auth failed');
  }
  const accessToken =
    typeof json.access_token === 'string' ? json.access_token : '';
  const expiresIn =
    typeof json.expires_in === 'number' ? json.expires_in : 3600;
  if (!accessToken) {
    throw new Error('FCM auth failed');
  }
  return {
    accessToken,
    expiresAtMs: Date.now() + expiresIn * 1000,
  };
}

function b64url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}
