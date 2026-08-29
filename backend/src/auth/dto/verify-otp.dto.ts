import { IsString, Matches } from 'class-validator';
import { CO_MOBILE_E164 } from '../phone/phone';

export class VerifyOtpDto {
  @IsString()
  @Matches(CO_MOBILE_E164, { message: 'Invalid phone' })
  phone!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'Invalid code' })
  code!: string;
}
