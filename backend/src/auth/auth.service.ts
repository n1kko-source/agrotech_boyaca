import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PRIVACY_POLICY_VERSION } from '../legal/privacy-policy';
import { fcmDeviceFrom } from '../notifications/dto/optional-fcm-device.dto';
import { NotificationService } from '../notifications/notifications.service';
import { Role } from '../shared/auth/role.enum';
import { LoginAdminDto } from './dto/login-admin.dto';
import { LoginJuridicaDto } from './dto/login-juridica.dto';
import { RegisterJuridicaDto } from './dto/register-juridica.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { normalizeEmail } from './email/email';
import {
  EmailAuthInvalidError,
  EmailAuthProviderError,
  EmailExistsError,
} from './email/email.errors';
import { FirebaseEmailClient } from './email/firebase-email.client';
import { normalizeNit } from './nit/nit';
import {
  OtpInvalidError,
  OtpProviderError,
  OtpRateLimitedError,
} from './otp/otp.errors';
import { OtpService, SendOtpResult } from './otp/otp.service';
import { normalizeCoMobile, phoneLookupHash } from './phone/phone';
import { DELETION_REQUESTS } from './privacy/deletion-request';
import type { DeletionRequestStore } from './privacy/deletion-request';
import { IssuedTokens, TokenService } from './tokens/token.service';
import { USERS_REPOSITORY } from './users/users.repository';
import type { AuthUser, UsersRepository } from './users/users.repository';

export type RegisterJuridicaResult = {
  registered: true;
};

export type ResendVerificationResult = {
  sent: true;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
    private readonly firebaseEmail: FirebaseEmailClient,
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    @Inject(DELETION_REQUESTS) private readonly deletions: DeletionRequestStore,
    private readonly notifications: NotificationService,
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
    requirePrivacyConsent(dto.acceptPrivacyPolicy);
    const phone = requirePhone(dto.phone);
    const phoneHash = this.hashPhone(phone);
    try {
      const verified = await this.otp.verify(phoneHash, dto.code);
      const user = await this.users.findOrCreateNatural(
        phone,
        verified.firebaseUid,
        PRIVACY_POLICY_VERSION,
      );
      const tokens = await this.tokens.issue(
        user.id,
        user.role,
        user.entityType,
      );
      this.bindDevice(user.id, dto);
      return tokens;
    } catch (err) {
      return mapOtpVerifyError(err);
    }
  }

  async registerJuridica(
    dto: RegisterJuridicaDto,
  ): Promise<RegisterJuridicaResult> {
    requirePrivacyConsent(dto.acceptPrivacyPolicy);
    const email = requireEmail(dto.email);
    const nit = requireNit(dto.nit);
    const entityType = dto.entityType ?? dto.entity_type;
    if (!entityType) {
      throw new BadRequestException('Invalid entity type');
    }
    const [byEmail, byNit] = await Promise.all([
      this.users.findJuridicaByEmail(email),
      this.users.findJuridicaByNit(nit),
    ]);
    if (byEmail || byNit) {
      throw new ConflictException('Account already exists');
    }

    let signedUp: { localId: string; idToken: string };
    try {
      signedUp = await this.firebaseEmail.signUp(email, dto.password);
    } catch (err) {
      return mapEmailRegisterError(err);
    }

    try {
      await this.users.createJuridica({
        email,
        nit,
        entityType,
        firebaseUid: signedUp.localId,
        privacyPolicyVersion: PRIVACY_POLICY_VERSION,
      });
    } catch (err) {
      await this.compensateFirebaseSignUp(signedUp.idToken);
      if (err instanceof ConflictException) {
        throw err;
      }
      throw err;
    }

    try {
      await this.firebaseEmail.sendEmailVerification(signedUp.idToken);
    } catch (err) {
      if (err instanceof EmailAuthProviderError) {
        throw new ServiceUnavailableException(
          'Unable to send verification email',
        );
      }
      throw err;
    }
    return { registered: true };
  }

  async resendJuridicaVerification(
    dto: LoginJuridicaDto,
  ): Promise<ResendVerificationResult> {
    const email = requireEmail(dto.email);
    try {
      const signedIn = await this.firebaseEmail.signIn(email, dto.password);
      const user = await this.users.findJuridicaByEmail(email);
      if (!user) {
        throw new UnauthorizedException('Unauthorized');
      }
      if (!signedIn.emailVerified) {
        await this.firebaseEmail.sendEmailVerification(signedIn.idToken);
      }
      return { sent: true };
    } catch (err) {
      if (err instanceof EmailAuthProviderError) {
        throw new ServiceUnavailableException(
          'Unable to send verification email',
        );
      }
      return mapEmailLoginError(err);
    }
  }

  async loginJuridica(dto: LoginJuridicaDto): Promise<IssuedTokens> {
    const email = requireEmail(dto.email);
    try {
      const signedIn = await this.firebaseEmail.signIn(email, dto.password);
      if (!signedIn.emailVerified) {
        throw new ForbiddenException('Forbidden');
      }
      const user = await this.users.findJuridicaByEmail(email);
      if (!user) {
        throw new UnauthorizedException('Unauthorized');
      }
      if (!user.verified) {
        throw new ForbiddenException('Forbidden');
      }
      const tokens = await this.tokens.issue(
        user.id,
        user.role,
        user.entityType,
      );
      this.bindDevice(user.id, dto);
      return tokens;
    } catch (err) {
      return mapEmailLoginError(err);
    }
  }

  async loginAdmin(dto: LoginAdminDto): Promise<IssuedTokens> {
    const email = requireEmail(dto.email);
    try {
      const signedIn = await this.firebaseEmail.signIn(email, dto.password);
      if (!signedIn.emailVerified) {
        throw new ForbiddenException('Forbidden');
      }
      const user = await this.users.findAdminByEmail(email);
      if (!user || user.role !== Role.ADMIN) {
        throw new UnauthorizedException('Unauthorized');
      }
      return this.tokens.issue(user.id, user.role, user.entityType);
    } catch (err) {
      return mapEmailLoginError(err);
    }
  }

  async refresh(refreshToken: string): Promise<IssuedTokens> {
    const payload = await this.tokens.takeRefresh(refreshToken);
    const user = await this.users.findById(payload.sub);
    if (!canRefresh(user, payload.role)) {
      throw new UnauthorizedException('Unauthorized');
    }
    return this.tokens.issue(user.id, user.role, user.entityType);
  }

  async logout(
    refreshToken: string,
    deviceId?: string,
  ): Promise<{ revoked: true }> {
    const userId = await this.tokens.revoke(refreshToken);
    if (deviceId && userId) {
      try {
        await this.notifications.unregisterDevice(userId, deviceId);
      } catch {
        this.logger.warn(`FCM device revoke failed user=${userId}`);
      }
    }
    return { revoked: true };
  }

  async requestDeletion(userId: string): Promise<{ requested: true }> {
    await this.deletions.request(userId);
    return { requested: true };
  }

  private bindDevice(
    userId: string,
    dto: { fcmToken?: string; deviceId?: string },
  ): void {
    void this.notifications.onLogin(userId, fcmDeviceFrom(dto)).catch(() => {
      this.logger.warn(`FCM bind failed user=${userId}`);
    });
  }

  private hashPhone(phoneE164: string): string {
    const pepper = this.config.get<string>('PII_HASH_PEPPER')?.trim();
    if (!pepper && this.config.get<string>('NODE_ENV') === 'production') {
      throw new ServiceUnavailableException('PII keys unavailable');
    }
    return phoneLookupHash(phoneE164, pepper || 'dev-pepper');
  }

  private async compensateFirebaseSignUp(idToken: string): Promise<void> {
    try {
      await this.firebaseEmail.deleteAccount(idToken);
    } catch {
      this.logger.error('Failed to delete Firebase user after persist error');
    }
  }
}

function canRefresh(user: AuthUser | null, role: Role): user is AuthUser {
  if (!user || user.role !== role) {
    return false;
  }
  if (user.role === Role.JURIDICA && !user.verified) {
    return false;
  }
  return true;
}

function requirePrivacyConsent(accepted: boolean | undefined): void {
  if (accepted !== true) {
    throw new BadRequestException('Privacy policy must be accepted');
  }
}

function requirePhone(raw: string): string {
  const phone = normalizeCoMobile(raw);
  if (!phone) {
    throw new BadRequestException('Invalid phone');
  }
  return phone;
}

function requireEmail(raw: string): string {
  const email = normalizeEmail(raw);
  if (!email) {
    throw new BadRequestException('Invalid email');
  }
  return email;
}

function requireNit(raw: string): string {
  const nit = normalizeNit(raw);
  if (!nit) {
    throw new BadRequestException('Invalid nit');
  }
  return nit;
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

function mapEmailRegisterError(err: unknown): never {
  if (err instanceof EmailExistsError) {
    throw new ConflictException('Account already exists');
  }
  if (err instanceof EmailAuthProviderError) {
    throw new ServiceUnavailableException('Unable to register account');
  }
  throw err;
}

function mapEmailLoginError(err: unknown): never {
  if (
    err instanceof EmailAuthInvalidError ||
    err instanceof EmailAuthProviderError
  ) {
    throw new UnauthorizedException('Unauthorized');
  }
  throw err;
}

export type { IssuedTokens };
