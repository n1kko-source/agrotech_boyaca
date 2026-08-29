import { ConfigService } from '@nestjs/config';
import { FirebaseOtpClient } from '../../src/auth/otp/firebase-otp.client';
import {
  OTP_MAX_ATTEMPTS,
  OTP_TTL_SECONDS,
} from '../../src/auth/otp/otp.constants';
import {
  OtpInvalidError,
  OtpRateLimitedError,
} from '../../src/auth/otp/otp.errors';
import { OtpService } from '../../src/auth/otp/otp.service';
import { phoneLookupHash } from '../../src/auth/phone/phone';
import { MemoryKvStore } from '../../src/shared/redis/memory-kv.store';

const PHONE = '+573001112233';
const PEPPER = 'unit-pepper';
const PHONE_HASH = phoneLookupHash(PHONE, PEPPER);
const CODE = '123456';

function configStub(): ConfigService {
  return {
    get: (key: string) => {
      if (key === 'NODE_ENV') {
        return 'test';
      }
      if (key === 'PII_HASH_PEPPER') {
        return PEPPER;
      }
      return undefined;
    },
  } as ConfigService;
}

function localOtp(clock: () => number): OtpService {
  const kv = new MemoryKvStore(clock);
  const firebase = {
    configured: false,
    sendVerificationCode: jest.fn(),
    signInWithPhoneNumber: jest.fn(),
  } as unknown as FirebaseOtpClient;
  return new OtpService(kv, configStub(), firebase, () => CODE);
}

describe('OtpService', () => {
  it('expires the OTP after TTL and rejects verify', async () => {
    let now = 1_000_000;
    const otp = localOtp(() => now);

    await otp.send(PHONE, PHONE_HASH);
    now += OTP_TTL_SECONDS * 1000 + 1;

    await expect(otp.verify(PHONE_HASH, CODE)).rejects.toBeInstanceOf(
      OtpInvalidError,
    );
  });

  it('invalidates the OTP after a successful verify (single use)', async () => {
    const otp = localOtp(() => 1_000_000);

    await otp.send(PHONE, PHONE_HASH);
    await expect(otp.verify(PHONE_HASH, CODE)).resolves.toEqual({
      firebaseUid: null,
    });
    await expect(otp.verify(PHONE_HASH, CODE)).rejects.toBeInstanceOf(
      OtpInvalidError,
    );
  });

  it('invalidates the OTP after max failed attempts', async () => {
    const otp = localOtp(() => 1_000_000);

    await otp.send(PHONE, PHONE_HASH);
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i += 1) {
      await expect(otp.verify(PHONE_HASH, '000000')).rejects.toBeInstanceOf(
        OtpInvalidError,
      );
    }
    await expect(otp.verify(PHONE_HASH, CODE)).rejects.toBeInstanceOf(
      OtpInvalidError,
    );
  });

  it('rate-limits a second send before cooldown expires', async () => {
    const otp = localOtp(() => 1_000_000);

    await otp.send(PHONE, PHONE_HASH);
    await expect(otp.send(PHONE, PHONE_HASH)).rejects.toBeInstanceOf(
      OtpRateLimitedError,
    );
  });

  it('does not put the phone number in error messages', async () => {
    const otp = localOtp(() => 1_000_000);
    await otp.send(PHONE, PHONE_HASH);
    try {
      await otp.verify(PHONE_HASH, '000000');
      throw new Error('expected verify to fail');
    } catch (err) {
      expect(err).toBeInstanceOf(OtpInvalidError);
      expect((err as Error).message).not.toContain(PHONE);
    }
  });
});
