import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { OptionalFcmDeviceDto } from '../../notifications/dto/optional-fcm-device.dto';

export class LoginJuridicaDto extends OptionalFcmDeviceDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password!: string;
}
