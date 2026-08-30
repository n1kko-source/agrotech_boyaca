import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { CountingKvStore } from './counting-kv.store';
import { KV_STORE } from './kv-store';
import { MemoryKvStore } from './memory-kv.store';
import { REDIS_CLIENT } from './redis.constants';
import { RedisOpsCounter } from './redis-ops.counter';
import { RedisKvStore } from './redis-kv.store';
import { UnavailableKvStore } from './unavailable-kv.store';

export const kvStoreProvider: Provider = {
  provide: KV_STORE,
  inject: [REDIS_CLIENT, ConfigService, RedisOpsCounter],
  useFactory: (
    redis: Redis | null,
    config: ConfigService,
    ops: RedisOpsCounter,
  ) => {
    if (redis) {
      return new CountingKvStore(new RedisKvStore(redis), ops);
    }
    if (config.get<string>('NODE_ENV') === 'production') {
      return new UnavailableKvStore();
    }
    return new CountingKvStore(new MemoryKvStore(), ops);
  },
};
