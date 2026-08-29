export class OtpInvalidError extends Error {
  constructor() {
    super('Invalid or expired code');
    this.name = 'OtpInvalidError';
  }
}

export class OtpRateLimitedError extends Error {
  constructor() {
    super('Too many OTP requests');
    this.name = 'OtpRateLimitedError';
  }
}

export class OtpProviderError extends Error {
  constructor(readonly kind: 'send' | 'verify') {
    super('OTP provider error');
    this.name = 'OtpProviderError';
  }
}
