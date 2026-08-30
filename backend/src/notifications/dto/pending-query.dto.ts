import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  PENDING_LIMIT_DEFAULT,
  PENDING_LIMIT_MAX,
} from '../notification.constants';

export class PendingQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PENDING_LIMIT_MAX)
  limit: number = PENDING_LIMIT_DEFAULT;
}
