import { IsBoolean } from 'class-validator';

export class VerifyJuridicaDto {
  @IsBoolean()
  verified!: boolean;
}
