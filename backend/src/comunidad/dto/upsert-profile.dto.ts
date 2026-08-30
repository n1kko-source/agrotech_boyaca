import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpsertProfileDto {
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName!: string;

  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  municipality!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(1000)
  bio?: string;

  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  category!: string;
}
