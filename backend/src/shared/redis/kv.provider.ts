import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { KV_STORE } from './kv-store';
import { MemoryKvStore } from './memory-kv.store';
import { REDIS_CLIENT } from './redis.constants';
import { RedisKvStore } from './redis-kv.store';
import { UnavailableKvStore } from './unavailable-kv.store';

export const kvStoreProvider: Provider = {
  provide: KV_STORE,
  inject: [REDIS_CLIENT, ConfigService],
  useFactory: (redis: Redis | null, config: ConfigService) => {
    if (redis) {
      return new RedisKvStore(redis);
    }
    if (config.get<string>('NODE_ENV') === 'production') {
      return new UnavailableKvStore();
    }
    return new MemoryKvStore();
  },
};
