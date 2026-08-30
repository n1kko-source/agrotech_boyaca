import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CursorPaginationQueryDto } from '../../shared/dto/cursor-pagination-query.dto';
import { GUIAS_CATEGORIA_MAX, GUIAS_CATEGORIA_MIN } from '../guias.constants';

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class ListGuiasQueryDto extends CursorPaginationQueryDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(GUIAS_CATEGORIA_MIN)
  @MaxLength(GUIAS_CATEGORIA_MAX)
  categoria?: string;
}
