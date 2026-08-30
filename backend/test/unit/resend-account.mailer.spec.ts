import { ConfigService } from '@nestjs/config';
import { ResendAccountMailer } from '../../src/admin/mailer/resend-account.mailer';

describe('ResendAccountMailer', () => {
  const config = {
    get: (key: string) => {
      if (key === 'RESEND_API_KEY') {
        return 're_test';
      }
      if (key === 'MAIL_FROM') {
        return 'AgroTech <noreply@example.com>';
      }
      return undefined;
    },
  } as ConfigService;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('posts to Resend without putting the recipient in the URL', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);
    const mailer = new ResendAccountMailer(config);
    await mailer.sendJuridicaVerified({
      userId: 'user-1',
      email: 'coop@example.com',
    });
    const url = String((fetchMock.mock.calls[0] as [string])[0]);
    expect(url).toContain('api.resend.com');
    expect(url).not.toContain('coop@example.com');
  });
});
