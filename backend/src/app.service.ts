import { Injectable } from '@nestjs/common';
import { R2UsageMeter } from './guias/r2-usage.meter';
import { RedisOpsCounter } from './shared/redis/redis-ops.counter';

export type HealthStatus = {
  status: 'ok';
  service: string;
  timestamp: string;
  redis: {
    ops: number;
    day: string;
    limit: number;
  };
  r2: {
    storageBytes: number;
    storageLimit: number;
    reads: number;
    readsLimit: number;
    month: string;
  };
};

@Injectable()
export class AppService {
  constructor(
    private readonly redisOps: RedisOpsCounter,
    private readonly r2Meter: R2UsageMeter,
  ) {}

  getHello(): string {
    return 'AgroTech Boyacá API';
  }

  getHealth(): HealthStatus {
    return {
      status: 'ok',
      service: 'agrotech-backend',
      timestamp: new Date().toISOString(),
      redis: this.redisOps.snapshot(),
      r2: this.r2Meter.snapshot(),
    };
  }
}
