import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import {
  DEVICE_ID_MAX,
  DEVICE_ID_MIN,
  FCM_TOKEN_MAX,
  FCM_TOKEN_MIN,
} from '../notification.constants';

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class RegisterDeviceDto {
  @Transform(trimString)
  @IsString()
  @MinLength(FCM_TOKEN_MIN)
  @MaxLength(FCM_TOKEN_MAX)
  fcmToken!: string;

  @Transform(trimString)
  @IsString()
  @MinLength(DEVICE_ID_MIN)
  @MaxLength(DEVICE_ID_MAX)
  deviceId!: string;
}
