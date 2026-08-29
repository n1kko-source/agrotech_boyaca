import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import {
  OtpInvalidError,
  OtpProviderError,
  OtpRateLimitedError,
} from './otp/otp.errors';
import { OtpService, SendOtpResult } from './otp/otp.service';
import { normalizeCoMobile, phoneLookupHash } from './phone/phone';
import { IssuedTokens, TokenService } from './tokens/token.service';
import { USERS_REPOSITORY } from './users/users.repository';
import type { UsersRepository } from './users/users.repository';

@Injectable()
export class AuthService {
  constructor(
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
  ) {}

  async sendOtp(dto: SendOtpDto): Promise<SendOtpResult> {
    const phone = requirePhone(dto.phone);
    const phoneHash = this.hashPhone(phone);
    try {
      return await this.otp.send(phone, phoneHash, {
        recaptchaToken: dto.recaptchaToken,
        playIntegrityToken: dto.playIntegrityToken,
      });
    } catch (err) {
      return mapOtpSendError(err);
    }
  }

  async verifyOtp(dto: VerifyOtpDto): Promise<IssuedTokens> {
    const phone = requirePhone(dto.phone);
    const phoneHash = this.hashPhone(phone);
    try {
      const verified = await this.otp.verify(phoneHash, dto.code);
      const user = await this.users.findOrCreateNatural(
        phone,
        verified.firebaseUid,
      );
      return this.tokens.issue(user.id, user.role);
    } catch (err) {
      return mapOtpVerifyError(err);
    }
  }

  async refresh(refreshToken: string): Promise<IssuedTokens> {
    return this.tokens.rotate(refreshToken);
  }

  private hashPhone(phoneE164: string): string {
    const pepper = this.config.get<string>('PII_HASH_PEPPER')?.trim();
    if (!pepper && this.config.get<string>('NODE_ENV') === 'production') {
      throw new ServiceUnavailableException('PII keys unavailable');
    }
    return phoneLookupHash(phoneE164, pepper || 'dev-pepper');
  }
}

function requirePhone(raw: string): string {
  const phone = normalizeCoMobile(raw);
  if (!phone) {
    throw new BadRequestException('Invalid phone');
  }
  return phone;
}

function mapOtpSendError(err: unknown): never {
  if (err instanceof OtpRateLimitedError) {
    throw new HttpException(
      'Too many OTP requests',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
  if (err instanceof OtpProviderError) {
    throw new ServiceUnavailableException('Unable to send verification code');
  }
  throw err;
}

function mapOtpVerifyError(err: unknown): never {
  if (err instanceof OtpInvalidError || err instanceof OtpProviderError) {
    throw new UnauthorizedException('Unauthorized');
  }
  throw err;
}

export type { IssuedTokens };
