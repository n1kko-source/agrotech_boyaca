import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { REDIS_CLIENT } from './redis.constants';
import { redisClientProvider } from './redis.provider';
import { RedisService } from './redis.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [redisClientProvider, RedisService],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}
