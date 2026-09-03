import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  PAYMENT_CHANNELS,
  type PaymentChannel,
} from '../suscripciones.constants';

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class RecordPaymentDto {
  @Transform(trimString)
  @IsIn(PAYMENT_CHANNELS)
  channel!: PaymentChannel;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  reference?: string;
}
