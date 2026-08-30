import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AccountMailer, JuridicaVerifiedNotice } from './account-mailer';

const RESEND_URL = 'https://api.resend.com/emails';

@Injectable()
export class ResendAccountMailer implements AccountMailer {
  private readonly logger = new Logger(ResendAccountMailer.name);
  private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis);

  constructor(private readonly config: ConfigService) {}

  async sendJuridicaVerified(notice: JuridicaVerifiedNotice): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY')?.trim();
    const from = this.config.get<string>('MAIL_FROM')?.trim();
    if (!apiKey || !from) {
      throw new Error('mailer unconfigured');
    }
    let res: Response;
    try {
      res = await this.fetchImpl(RESEND_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [notice.email],
          subject: 'Tu cuenta AgroTech fue verificada',
          text: 'Ya puedes iniciar sesión en la aplicación AgroTech Boyacá.',
        }),
      });
    } catch {
      this.logger.error(`Verification email failed user=${notice.userId}`);
      throw new Error('mailer unavailable');
    }
    if (!res.ok) {
      this.logger.error(`Verification email rejected user=${notice.userId}`);
      throw new Error('mailer rejected');
    }
  }
}
