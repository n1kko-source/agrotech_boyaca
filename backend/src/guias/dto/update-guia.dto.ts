import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import {
  GUIAS_CATEGORIA_MAX,
  GUIAS_CATEGORIA_MIN,
  GUIAS_SUBSECTOR_MAX,
  GUIAS_SUBSECTOR_MIN,
  GUIAS_TITLE_MAX,
  GUIAS_TITLE_MIN,
} from '../guias.constants';

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateGuiaDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(GUIAS_TITLE_MIN)
  @MaxLength(GUIAS_TITLE_MAX)
  titulo?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(GUIAS_CATEGORIA_MIN)
  @MaxLength(GUIAS_CATEGORIA_MAX)
  categoria?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(GUIAS_SUBSECTOR_MIN)
  @MaxLength(GUIAS_SUBSECTOR_MAX)
  subsector?: string;
}
