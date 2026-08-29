import { IsOptional, IsString, Matches } from 'class-validator';
import { CO_MOBILE_E164 } from '../phone/phone';

export class SendOtpDto {
  @IsString()
  @Matches(CO_MOBILE_E164, { message: 'Invalid phone' })
  phone!: string;

  @IsOptional()
  @IsString()
  recaptchaToken?: string;

  @IsOptional()
  @IsString()
  playIntegrityToken?: string;
}
