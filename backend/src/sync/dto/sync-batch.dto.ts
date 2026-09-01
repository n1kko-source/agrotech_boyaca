import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import {
  SYNC_ENTITIES,
  SYNC_OPS_MAX,
  type SyncEntity,
} from '../sync.constants';

export class SyncOpDto {
  @IsUUID('4')
  opId!: string;

  @IsIn(SYNC_ENTITIES)
  entity!: SyncEntity;

  @IsUUID('4')
  entityId!: string;

  @IsISO8601()
  clientTs!: string;

  @IsObject()
  payload!: Record<string, unknown>;
}

export class SyncBatchDto {
  @IsOptional()
  @IsISO8601()
  since?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(SYNC_OPS_MAX)
  @ValidateNested({ each: true })
  @Type(() => SyncOpDto)
  ops: SyncOpDto[] = [];
}
