import { Equals, IsBoolean, IsString, Matches } from 'class-validator';
import { OptionalFcmDeviceDto } from '../../notifications/dto/optional-fcm-device.dto';
import { CO_MOBILE_E164 } from '../phone/phone';

export class VerifyOtpDto extends OptionalFcmDeviceDto {
  @IsString()
  @Matches(CO_MOBILE_E164, { message: 'Invalid phone' })
  phone!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'Invalid code' })
  code!: string;

  @IsBoolean()
  @Equals(true, { message: 'Privacy policy must be accepted' })
  acceptPrivacyPolicy!: true;
}
