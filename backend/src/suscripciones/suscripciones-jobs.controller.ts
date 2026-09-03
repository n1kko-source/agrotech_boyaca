import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../shared/decorators/public.decorator';
import { SUSCRIPCION_JOB_SECRET_HEADER } from './suscripciones.constants';
import {
  SuscripcionesService,
  type EvaluateResult,
} from './suscripciones.service';

@Controller('suscripciones')
export class SuscripcionesJobsController {
  constructor(private readonly suscripciones: SuscripcionesService) {}

  @Post('jobs/evaluate')
  @Public()
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  evaluate(
    @Headers(SUSCRIPCION_JOB_SECRET_HEADER) secret: string | undefined,
  ): Promise<EvaluateResult> {
    this.suscripciones.assertJobSecret(secret);
    return this.suscripciones.evaluate();
  }
}
