import { ThrottlerStorage } from '@nestjs/throttler';
import Redis from 'ioredis';
import { THROTTLE_KEY_PREFIX } from './redis.constants';

type StorageRecord = {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
};

export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<StorageRecord> {
    const redisKey = `${THROTTLE_KEY_PREFIX}${throttlerName}:${key}`;
    const hits = await this.redis.incr(redisKey);
    if (hits === 1) {
      await this.redis.pexpire(redisKey, ttl);
    }
    const pttl = await this.redis.pttl(redisKey);
    const timeToExpire = Math.max(Math.ceil(pttl / 1000), 0);
    const isBlocked = hits > limit;
    const blockMs = blockDuration > 0 ? blockDuration : ttl;

    return {
      totalHits: hits,
      timeToExpire,
      isBlocked,
      timeToBlockExpire: isBlocked ? Math.max(Math.ceil(blockMs / 1000), 0) : 0,
    };
  }
}
