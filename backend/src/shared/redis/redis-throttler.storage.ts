import { ThrottlerStorage } from '@nestjs/throttler';
import Redis from 'ioredis';
import { THROTTLE_KEY_PREFIX } from './redis.constants';
import { RedisOpsCounter } from './redis-ops.counter';

type StorageRecord = {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
};

export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(
    private readonly redis: Redis,
    private readonly ops?: RedisOpsCounter,
  ) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<StorageRecord> {
    const redisKey = `${THROTTLE_KEY_PREFIX}${throttlerName}:${key}`;
    const hits = await this.redis.incr(redisKey);
    let commands = 1;
    if (hits === 1) {
      await this.redis.pexpire(redisKey, ttl);
      commands += 1;
    }
    const pttl = await this.redis.pttl(redisKey);
    this.ops?.record(commands + 1);
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
