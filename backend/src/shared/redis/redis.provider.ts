import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

export const redisClientProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Redis | null => {
    const url = config.get<string>('REDIS_URL');
    if (!url?.trim()) {
      return null;
    }
    return new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  },
};
