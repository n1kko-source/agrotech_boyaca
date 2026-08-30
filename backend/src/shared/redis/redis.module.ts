import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KV_STORE } from './kv-store';
import { kvStoreProvider } from './kv.provider';
import { REDIS_CLIENT } from './redis.constants';
import { RedisOpsCounter } from './redis-ops.counter';
import { redisClientProvider } from './redis.provider';
import { RedisService } from './redis.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    redisClientProvider,
    RedisOpsCounter,
    kvStoreProvider,
    RedisService,
  ],
  exports: [REDIS_CLIENT, KV_STORE, RedisService, RedisOpsCounter],
})
export class RedisModule {}
