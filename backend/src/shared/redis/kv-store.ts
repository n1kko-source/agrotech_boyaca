export const KV_STORE = Symbol('KV_STORE');

export interface KvStore {
  get(key: string): Promise<string | null>;
  /** Atomically read and delete. Used for refresh-token rotation. */
  getdel(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  incr(key: string, ttlSeconds: number): Promise<number>;
}
