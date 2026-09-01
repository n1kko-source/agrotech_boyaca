import { Transform } from 'class-transformer';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import {
  MESSAGE_BODY_MAX,
  MESSAGE_BODY_MIN,
} from '../../comunidad/messaging.constants';

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class SyncMessagePayloadDto {
  @Transform(trimString)
  @IsUUID('4')
  conversationId!: string;

  @Transform(trimString)
  @IsString()
  @MinLength(MESSAGE_BODY_MIN)
  @MaxLength(MESSAGE_BODY_MAX)
  body!: string;
}
