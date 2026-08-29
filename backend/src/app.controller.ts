import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AppService } from './app.service';
import type { HealthStatus } from './app.service';
import { Public } from './shared/decorators/public.decorator';

@Public()
@SkipThrottle()
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /** Liveness probe for anti-sleep cron (AG-12). */
  @Get('health')
  getHealth(): HealthStatus {
    return this.appService.getHealth();
  }
}
