import { createHmac, randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolvePepper } from '../../shared/config/pii-keys';
import { KV_STORE } from '../../shared/redis/kv-store';
import type { KvStore } from '../../shared/redis/kv-store';
import { FirebaseOtpClient } from './firebase-otp.client';
import {
  OTP_COOLDOWN_SECONDS,
  OTP_CODE_LENGTH,
  OTP_HOURLY_WINDOW_SECONDS,
  OTP_MAX_ATTEMPTS,
  OTP_PHONE_HOURLY_LIMIT,
  OTP_TTL_SECONDS,
  otpCooldownKey,
  otpHourlyKey,
  otpSessionKey,
} from './otp.constants';
import { OtpInvalidError, OtpRateLimitedError } from './otp.errors';

export const OTP_CODE_GENERATOR = Symbol('OTP_CODE_GENERATOR');

export type OtpMode = 'local' | 'firebase';

export type OtpSession = {
  provider: OtpMode;
  codeHash?: string;
  sessionInfo?: string;
  attempts: number;
};

export type SendOtpResult = {
  sent: true;
  devCode?: string;
};

export type VerifyOtpResult = {
  firebaseUid: string | null;
};

@Injectable()
export class OtpService {
  constructor(
    @Inject(KV_STORE) private readonly kv: KvStore,
    private readonly config: ConfigService,
    private readonly firebase: FirebaseOtpClient,
    @Inject(OTP_CODE_GENERATOR) private readonly generateCode: () => string,
  ) {}

  get mode(): OtpMode {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      return 'firebase';
    }
    return this.firebase.configured ? 'firebase' : 'local';
  }

  async send(
    phoneE164: string,
    phoneHash: string,
    tokens?: { recaptchaToken?: string; playIntegrityToken?: string },
  ): Promise<SendOtpResult> {
    await this.assertNotRateLimited(phoneHash);

    const session: OtpSession = { provider: this.mode, attempts: 0 };
    const result: SendOtpResult = { sent: true };

    if (this.mode === 'firebase') {
      session.sessionInfo = await this.firebase.sendVerificationCode({
        phoneNumber: phoneE164,
        recaptchaToken: tokens?.recaptchaToken,
        playIntegrityToken: tokens?.playIntegrityToken,
      });
    } else {
      const code = this.generateCode();
      session.codeHash = hashOtp(code, phoneHash, this.pepper());
      if (this.exposeDevCode()) {
        result.devCode = code;
      }
    }

    await this.kv.set(
      otpSessionKey(phoneHash),
      JSON.stringify(session),
      OTP_TTL_SECONDS,
    );
    await this.kv.set(otpCooldownKey(phoneHash), '1', OTP_COOLDOWN_SECONDS);
    await this.kv.incr(otpHourlyKey(phoneHash), OTP_HOURLY_WINDOW_SECONDS);

    return result;
  }

  async verify(phoneHash: string, code: string): Promise<VerifyOtpResult> {
    const raw = await this.kv.get(otpSessionKey(phoneHash));
    if (!raw) {
      throw new OtpInvalidError();
    }

    const session = parseSession(raw);
    if (!session || session.attempts >= OTP_MAX_ATTEMPTS) {
      await this.kv.del(otpSessionKey(phoneHash));
      throw new OtpInvalidError();
    }

    const valid = await this.matchCode(session, phoneHash, code);
    if (!valid) {
      session.attempts += 1;
      if (session.attempts >= OTP_MAX_ATTEMPTS) {
        await this.kv.del(otpSessionKey(phoneHash));
      } else {
        await this.kv.set(
          otpSessionKey(phoneHash),
          JSON.stringify(session),
          OTP_TTL_SECONDS,
        );
      }
      throw new OtpInvalidError();
    }

    await this.kv.del(otpSessionKey(phoneHash));
    return { firebaseUid: valid.firebaseUid };
  }

  private async matchCode(
    session: OtpSession,
    phoneHash: string,
    code: string,
  ): Promise<{ firebaseUid: string | null } | null> {
    if (session.provider === 'firebase') {
      if (!session.sessionInfo) {
        return null;
      }
      try {
        const firebaseUid = await this.firebase.signInWithPhoneNumber(
          session.sessionInfo,
          code,
        );
        return { firebaseUid };
      } catch {
        return null;
      }
    }
    if (!session.codeHash) {
      return null;
    }
    const expected = hashOtp(code, phoneHash, this.pepper());
    if (expected !== session.codeHash) {
      return null;
    }
    return { firebaseUid: null };
  }

  private async assertNotRateLimited(phoneHash: string): Promise<void> {
    const cooling = await this.kv.get(otpCooldownKey(phoneHash));
    if (cooling) {
      throw new OtpRateLimitedError();
    }
    const hourlyRaw = await this.kv.get(otpHourlyKey(phoneHash));
    const hourly = hourlyRaw ? Number(hourlyRaw) : 0;
    if (hourly >= OTP_PHONE_HOURLY_LIMIT) {
      throw new OtpRateLimitedError();
    }
  }

  private pepper(): string {
    return resolvePepper(this.config);
  }

  private exposeDevCode(): boolean {
    const env = this.config.get<string>('NODE_ENV');
    return env === 'development' || env === 'test';
  }
}

export function randomOtpCode(): string {
  return randomInt(0, 10 ** OTP_CODE_LENGTH)
    .toString()
    .padStart(OTP_CODE_LENGTH, '0');
}

export function hashOtp(
  code: string,
  phoneHash: string,
  pepper: string,
): string {
  return createHmac('sha256', pepper)
    .update(`${phoneHash}:${code}`)
    .digest('hex');
}

function parseSession(raw: string): OtpSession | null {
  try {
    const parsed = JSON.parse(raw) as OtpSession;
    if (parsed.provider !== 'local' && parsed.provider !== 'firebase') {
      return null;
    }
    if (typeof parsed.attempts !== 'number') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
