import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class RedisService implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis | null) {}

  async onModuleDestroy(): Promise<void> {
    if (!this.client) {
      return;
    }
    const { status } = this.client;
    if (status === 'ready' || status === 'connect' || status === 'connecting') {
      await this.client.quit();
      return;
    }
    this.client.disconnect();
  }
}
