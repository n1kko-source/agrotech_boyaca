import { Injectable } from '@nestjs/common';
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
};

@Injectable()
export class AppService {
  constructor(private readonly redisOps: RedisOpsCounter) {}

  getHello(): string {
    return 'AgroTech Boyacá API';
  }

  getHealth(): HealthStatus {
    return {
      status: 'ok',
      service: 'agrotech-backend',
      timestamp: new Date().toISOString(),
      redis: this.redisOps.snapshot(),
    };
  }
}
