import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import {
  DEVICE_ID_MAX,
  DEVICE_ID_MIN,
} from '../../notifications/notification.constants';
import { RefreshTokenDto } from './refresh-token.dto';

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class LogoutDto extends RefreshTokenDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(DEVICE_ID_MIN)
  @MaxLength(DEVICE_ID_MAX)
  deviceId?: string;
}
