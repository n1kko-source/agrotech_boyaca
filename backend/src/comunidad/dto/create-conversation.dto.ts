import { Transform } from 'class-transformer';
import { IsUUID } from 'class-validator';

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateConversationDto {
  @Transform(trimString)
  @IsUUID('4')
  postId!: string;
}
