import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../shared/decorators/public.decorator';
import {
  AuthService,
  RegisterJuridicaResult,
  ResendVerificationResult,
} from './auth.service';
import { LoginJuridicaDto } from './dto/login-juridica.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterJuridicaDto } from './dto/register-juridica.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { SendOtpResult } from './otp/otp.service';
import { IssuedTokens } from './tokens/token.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('otp/send')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 600_000 } })
  sendOtp(@Body() dto: SendOtpDto): Promise<SendOtpResult> {
    return this.auth.sendOtp(dto);
  }

  @Post('otp/verify')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  verifyOtp(@Body() dto: VerifyOtpDto): Promise<IssuedTokens> {
    return this.auth.verifyOtp(dto);
  }

  @Post('register/juridica')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  registerJuridica(
    @Body() dto: RegisterJuridicaDto,
  ): Promise<RegisterJuridicaResult> {
    return this.auth.registerJuridica(dto);
  }

  @Post('register/juridica/resend')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  resendJuridicaVerification(
    @Body() dto: LoginJuridicaDto,
  ): Promise<ResendVerificationResult> {
    return this.auth.resendJuridicaVerification(dto);
  }

  @Post('login/juridica')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  loginJuridica(@Body() dto: LoginJuridicaDto): Promise<IssuedTokens> {
    return this.auth.loginJuridica(dto);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto): Promise<IssuedTokens> {
    return this.auth.refresh(dto.refreshToken);
  }
}
