import { ConfigService } from '@nestjs/config';
import { FirebaseOtpClient } from '../../src/auth/otp/firebase-otp.client';
import { OtpProviderError } from '../../src/auth/otp/otp.errors';

describe('FirebaseOtpClient', () => {
  const config = {
    get: (key: string) =>
      key === 'FIREBASE_WEB_API_KEY' ? 'test-web-key' : undefined,
  } as ConfigService;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends via Identity Toolkit and returns sessionInfo', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sessionInfo: 'sess-1' }),
    });
    jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

    const client = new FirebaseOtpClient(config);
    const session = await client.sendVerificationCode({
      phoneNumber: '+573001234567',
      playIntegrityToken: 'tok',
    });
    expect(session).toBe('sess-1');
    expect(fetchMock).toHaveBeenCalled();
    const firstCall = fetchMock.mock.calls[0] as [string, unknown] | undefined;
    const url = String(firstCall?.[0]);
    expect(url).toContain('accounts:sendVerificationCode');
    expect(url).not.toContain('573001234567');
  });

  it('maps provider failures without leaking the phone', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: { message: 'QUOTA' } }),
    } as Response);

    const client = new FirebaseOtpClient(config);
    try {
      await client.sendVerificationCode({ phoneNumber: '+573001234567' });
      throw new Error('expected send to fail');
    } catch (err) {
      expect(err).toBeInstanceOf(OtpProviderError);
      expect(String(err)).not.toContain('573001234567');
    }
  });
});
