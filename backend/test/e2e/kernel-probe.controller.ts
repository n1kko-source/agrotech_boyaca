import { Body, Controller, Get, Post } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { IsString } from 'class-validator';
import { Public } from '../../src/shared/decorators/public.decorator';

export class KernelProbeDto {
  @IsString()
  name!: string;
}

@Controller('kernel-probe')
export class KernelProbeController {
  @Post('validate')
  @Public()
  @SkipThrottle()
  validate(@Body() dto: KernelProbeDto): KernelProbeDto {
    return dto;
  }

  @Get('protected')
  ping(): { ok: boolean } {
    return { ok: true };
  }

  @Get('large')
  @Public()
  @SkipThrottle()
  large(): { filler: string } {
    return { filler: 'x'.repeat(2048) };
  }
}
