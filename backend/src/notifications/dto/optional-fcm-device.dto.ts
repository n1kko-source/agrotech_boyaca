import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import {
  DEVICE_ID_MAX,
  DEVICE_ID_MIN,
  FCM_TOKEN_MAX,
  FCM_TOKEN_MIN,
} from '../notification.constants';

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function hasFcmFields(dto: { fcmToken?: string; deviceId?: string }): boolean {
  return Boolean(dto.fcmToken) || Boolean(dto.deviceId);
}

/** Optional device pair. Both required when either is present. */
export class OptionalFcmDeviceDto {
  @ValidateIf(hasFcmFields)
  @Transform(trimString)
  @IsString()
  @MinLength(FCM_TOKEN_MIN)
  @MaxLength(FCM_TOKEN_MAX)
  fcmToken?: string;

  @ValidateIf(hasFcmFields)
  @Transform(trimString)
  @IsString()
  @MinLength(DEVICE_ID_MIN)
  @MaxLength(DEVICE_ID_MAX)
  deviceId?: string;
}

export function fcmDeviceFrom(
  dto: OptionalFcmDeviceDto,
): { token: string; deviceId: string } | null {
  if (!dto.fcmToken || !dto.deviceId) {
    return null;
  }
  return { token: dto.fcmToken, deviceId: dto.deviceId };
}
