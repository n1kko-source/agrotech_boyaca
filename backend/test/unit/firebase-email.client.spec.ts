import { ConfigService } from '@nestjs/config';
import {
  EmailAuthInvalidError,
  EmailAuthProviderError,
  EmailExistsError,
} from '../../src/auth/email/email.errors';
import { FirebaseEmailClient } from '../../src/auth/email/firebase-email.client';

describe('FirebaseEmailClient', () => {
  const config = {
    get: (key: string) =>
      key === 'FIREBASE_WEB_API_KEY' ? 'test-web-key' : undefined,
  } as ConfigService;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('signs up via Identity Toolkit without putting email in the URL', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ localId: 'uid-1', idToken: 'id-tok' }),
    });
    jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

    const client = new FirebaseEmailClient(config);
    const result = await client.signUp('coop@example.com', 'password12');
    expect(result).toEqual({ localId: 'uid-1', idToken: 'id-tok' });
    const firstCall = fetchMock.mock.calls[0] as [string, unknown] | undefined;
    const url = String(firstCall?.[0]);
    expect(url).toContain('accounts:signUp');
    expect(url).not.toContain('coop@example.com');
  });

  it('sends VERIFY_EMAIL oob code', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ email: 'coop@example.com' }),
    });
    jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

    const client = new FirebaseEmailClient(config);
    await client.sendEmailVerification('id-tok');
    const url = String((fetchMock.mock.calls[0] as [string])[0]);
    expect(url).toContain('accounts:sendOobCode');
  });

  it('maps EMAIL_EXISTS without leaking the address', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: { message: 'EMAIL_EXISTS' } }),
    } as Response);

    const client = new FirebaseEmailClient(config);
    try {
      await client.signUp('coop@example.com', 'password12');
      throw new Error('expected signUp to fail');
    } catch (err) {
      expect(err).toBeInstanceOf(EmailExistsError);
      expect(String(err)).not.toContain('coop@example.com');
    }
  });

  it('maps invalid login credentials', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: { message: 'INVALID_PASSWORD' } }),
    } as Response);

    const client = new FirebaseEmailClient(config);
    await expect(
      client.signIn('coop@example.com', 'wrong-password'),
    ).rejects.toBeInstanceOf(EmailAuthInvalidError);
  });

  it('maps provider failures', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: { message: 'QUOTA' } }),
    } as Response);

    const client = new FirebaseEmailClient(config);
    await expect(
      client.signUp('coop@example.com', 'password12'),
    ).rejects.toBeInstanceOf(EmailAuthProviderError);
  });

  it('deletes via Identity Toolkit without putting the token in the URL', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
    jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

    const client = new FirebaseEmailClient(config);
    await client.deleteAccount('id-tok');
    const url = String((fetchMock.mock.calls[0] as [string])[0]);
    expect(url).toContain('accounts:delete');
    expect(url).not.toContain('id-tok');
  });
});
