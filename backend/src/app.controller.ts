import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import type { HealthStatus } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /** Liveness probe for Railway + anti-sleep cron (AG-12). */
  @Get('health')
  getHealth(): HealthStatus {
    return this.appService.getHealth();
  }
}
