import Redis from 'ioredis';
import { KvStore } from './kv-store';

export class RedisKvStore implements KvStore {
  constructor(private readonly redis: Redis) {}

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async getdel(key: string): Promise<string | null> {
    return this.redis.getdel(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, 'EX', ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async incr(key: string, ttlSeconds: number): Promise<number> {
    const hits = await this.redis.incr(key);
    if (hits === 1) {
      await this.redis.expire(key, ttlSeconds);
    }
    return hits;
  }
}
