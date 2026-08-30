import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  ALERT_KINDS,
  MUNICIPIO_MAX,
  MUNICIPIO_MIN,
  type AlertKind,
} from '../clima.constants';

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateAlertaDto {
  @Transform(trimString)
  @IsString()
  @MinLength(MUNICIPIO_MIN)
  @MaxLength(MUNICIPIO_MAX)
  municipio!: string;

  @IsIn(ALERT_KINDS)
  kind!: AlertKind;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
