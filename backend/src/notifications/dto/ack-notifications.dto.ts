import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';
import { PENDING_LIMIT_MAX } from '../notification.constants';

export class AckNotificationsDto {
  @IsArray()
  @ArrayMaxSize(PENDING_LIMIT_MAX)
  @IsUUID('4', { each: true })
  ids!: string[];
}
