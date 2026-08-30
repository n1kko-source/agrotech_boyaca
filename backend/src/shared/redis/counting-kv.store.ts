import { KvStore } from './kv-store';
import { RedisOpsCounter } from './redis-ops.counter';

/** Counts each KV call as one Redis command (get/set/del/getdel/incr). */
export class CountingKvStore implements KvStore {
  constructor(
    private readonly inner: KvStore,
    private readonly ops: RedisOpsCounter,
  ) {}

  get(key: string): Promise<string | null> {
    this.ops.record(1);
    return this.inner.get(key);
  }

  getdel(key: string): Promise<string | null> {
    this.ops.record(1);
    return this.inner.getdel(key);
  }

  set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.ops.record(1);
    return this.inner.set(key, value, ttlSeconds);
  }

  del(key: string): Promise<void> {
    this.ops.record(1);
    return this.inner.del(key);
  }

  incr(key: string, ttlSeconds: number): Promise<number> {
    this.ops.record(1);
    return this.inner.incr(key, ttlSeconds);
  }
}
