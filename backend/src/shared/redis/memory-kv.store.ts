import { KvStore } from './kv-store';

type Entry = { value: string; expiresAt: number };

export class MemoryKvStore implements KvStore {
  private readonly map = new Map<string, Entry>();

  constructor(private readonly clock: () => number = () => Date.now()) {}

  get(key: string): Promise<string | null> {
    const entry = this.map.get(key);
    if (!entry) {
      return Promise.resolve(null);
    }
    if (entry.expiresAt <= this.clock()) {
      this.map.delete(key);
      return Promise.resolve(null);
    }
    return Promise.resolve(entry.value);
  }

  getdel(key: string): Promise<string | null> {
    const entry = this.map.get(key);
    if (!entry) {
      return Promise.resolve(null);
    }
    this.map.delete(key);
    if (entry.expiresAt <= this.clock()) {
      return Promise.resolve(null);
    }
    return Promise.resolve(entry.value);
  }

  set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.map.set(key, {
      value,
      expiresAt: this.clock() + ttlSeconds * 1000,
    });
    return Promise.resolve();
  }

  del(key: string): Promise<void> {
    this.map.delete(key);
    return Promise.resolve();
  }

  incr(key: string, ttlSeconds: number): Promise<number> {
    const now = this.clock();
    const existing = this.map.get(key);
    if (!existing || existing.expiresAt <= now) {
      this.map.set(key, {
        value: '1',
        expiresAt: now + ttlSeconds * 1000,
      });
      return Promise.resolve(1);
    }
    const next = Number(existing.value) + 1;
    existing.value = String(next);
    return Promise.resolve(next);
  }
}
