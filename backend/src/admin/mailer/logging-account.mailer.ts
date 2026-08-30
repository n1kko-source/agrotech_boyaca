import { Injectable, Logger } from '@nestjs/common';
import type { AccountMailer, JuridicaVerifiedNotice } from './account-mailer';

@Injectable()
export class LoggingAccountMailer implements AccountMailer {
  private readonly logger = new Logger(LoggingAccountMailer.name);

  sendJuridicaVerified(notice: JuridicaVerifiedNotice): Promise<void> {
    this.logger.log(`Verification email queued user=${notice.userId}`);
    return Promise.resolve();
  }
}
