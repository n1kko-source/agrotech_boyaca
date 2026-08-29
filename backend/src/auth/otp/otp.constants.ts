export const OTP_TTL_SECONDS = 300;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_COOLDOWN_SECONDS = 60;
export const OTP_PHONE_HOURLY_LIMIT = 5;
export const OTP_HOURLY_WINDOW_SECONDS = 3600;
export const OTP_CODE_LENGTH = 6;

export const OTP_KEY_PREFIX = 'agrotech:otp:';

export function otpSessionKey(phoneHash: string): string {
  return `${OTP_KEY_PREFIX}session:${phoneHash}`;
}

export function otpCooldownKey(phoneHash: string): string {
  return `${OTP_KEY_PREFIX}cool:${phoneHash}`;
}

export function otpHourlyKey(phoneHash: string): string {
  return `${OTP_KEY_PREFIX}hourly:${phoneHash}`;
}
