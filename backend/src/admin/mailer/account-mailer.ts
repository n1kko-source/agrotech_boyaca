export const ACCOUNT_MAILER = Symbol('ACCOUNT_MAILER');

export type JuridicaVerifiedNotice = {
  userId: string;
  email: string;
};

export interface AccountMailer {
  sendJuridicaVerified(notice: JuridicaVerifiedNotice): Promise<void>;
}
