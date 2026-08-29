import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpProviderError } from './otp.errors';

const IDENTITY_TOOLKIT = 'https://identitytoolkit.googleapis.com/v1';

type IdentityJson = Record<string, unknown>;

export type FirebaseSendInput = {
  phoneNumber: string;
  recaptchaToken?: string;
  playIntegrityToken?: string;
};

@Injectable()
export class FirebaseOtpClient {
  private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis);

  constructor(private readonly config: ConfigService) {}

  get configured(): boolean {
    return Boolean(this.apiKey);
  }

  async sendVerificationCode(input: FirebaseSendInput): Promise<string> {
    const body: Record<string, string> = { phoneNumber: input.phoneNumber };
    if (input.recaptchaToken) {
      body.recaptchaToken = input.recaptchaToken;
    }
    if (input.playIntegrityToken) {
      body.playIntegrityToken = input.playIntegrityToken;
    }
    const json = await this.post('accounts:sendVerificationCode', body, 'send');
    const sessionInfo = json.sessionInfo;
    if (typeof sessionInfo !== 'string' || sessionInfo.length === 0) {
      throw new OtpProviderError('send');
    }
    return sessionInfo;
  }

  async signInWithPhoneNumber(
    sessionInfo: string,
    code: string,
  ): Promise<string> {
    const json = await this.post(
      'accounts:signInWithPhoneNumber',
      { sessionInfo, code },
      'verify',
    );
    const localId = json.localId;
    if (typeof localId !== 'string' || localId.length === 0) {
      throw new OtpProviderError('verify');
    }
    return localId;
  }

  private get apiKey(): string {
    return this.config.get<string>('FIREBASE_WEB_API_KEY')?.trim() ?? '';
  }

  private async post(
    path: string,
    body: Record<string, string>,
    kind: 'send' | 'verify',
  ): Promise<IdentityJson> {
    if (!this.apiKey) {
      throw new OtpProviderError(kind);
    }
    let res: Response;
    try {
      res = await this.fetchImpl(
        `${IDENTITY_TOOLKIT}/${path}?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Firebase-Locale': 'es',
          },
          body: JSON.stringify(body),
        },
      );
    } catch {
      throw new OtpProviderError(kind);
    }
    let json: IdentityJson = {};
    try {
      json = (await res.json()) as IdentityJson;
    } catch {
      throw new OtpProviderError(kind);
    }
    if (!res.ok) {
      throw new OtpProviderError(kind);
    }
    return json;
  }
}
