import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ENTITY_TYPES, type EntityTypeValue } from '../entity-type';

export class RegisterJuridicaDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(20)
  nit!: string;

  @IsOptional()
  @IsIn(ENTITY_TYPES)
  entityType?: EntityTypeValue;

  @IsOptional()
  @IsIn(ENTITY_TYPES)
  entity_type?: EntityTypeValue;
}
