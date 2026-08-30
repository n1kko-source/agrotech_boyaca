import { generateKeyPairSync } from 'node:crypto';
import { googleAssertionJwt } from '../../src/notifications/fcm/google-oauth';

describe('googleAssertionJwt', () => {
  it('signs an RS256 JWT for the FCM scope', () => {
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const jwt = googleAssertionJwt(
      {
        clientEmail: 'fcm@agrotech.iam.gserviceaccount.com',
        privateKey,
      },
      1_700_000_000,
    );
    const [header, payload, signature] = jwt.split('.');
    expect(header).toBeTruthy();
    expect(payload).toBeTruthy();
    expect(signature).toBeTruthy();
    const claims = JSON.parse(
      Buffer.from(payload ?? '', 'base64url').toString('utf8'),
    ) as {
      iss: string;
      aud: string;
      scope: string;
      exp: number;
    };
    expect(claims.iss).toBe('fcm@agrotech.iam.gserviceaccount.com');
    expect(claims.aud).toBe('https://oauth2.googleapis.com/token');
    expect(claims.scope).toContain('firebase.messaging');
    expect(claims.exp).toBe(1_700_003_600);
  });
});
