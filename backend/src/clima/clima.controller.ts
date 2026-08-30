import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../shared/decorators/public.decorator';
import {
  ClimaService,
  type ClimaView,
  type EvaluateResult,
} from './clima.service';

@Controller('clima')
export class ClimaController {
  constructor(private readonly clima: ClimaService) {}

  @Post('jobs/evaluate')
  @Public()
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  evaluate(
    @Headers('x-clima-job-secret') secret: string | undefined,
  ): Promise<EvaluateResult> {
    this.clima.assertJobSecret(secret);
    return this.clima.evaluateAlerts();
  }

  @Get(':municipio')
  get(@Param('municipio') municipio: string): Promise<ClimaView> {
    return this.clima.get(municipio);
  }
}
