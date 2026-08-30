import { ServiceUnavailableException } from '@nestjs/common';
import { KvStore } from './kv-store';

/** Production without Redis: health still boots; OTP/refresh fail closed. */
export class UnavailableKvStore implements KvStore {
  get(key: string): Promise<string | null> {
    void key;
    return rejectUnavailable();
  }

  getdel(key: string): Promise<string | null> {
    void key;
    return rejectUnavailable();
  }

  set(key: string, value: string, ttlSeconds: number): Promise<void> {
    void key;
    void value;
    void ttlSeconds;
    return rejectUnavailable();
  }

  del(key: string): Promise<void> {
    void key;
    return rejectUnavailable();
  }

  incr(key: string, ttlSeconds: number): Promise<number> {
    void key;
    void ttlSeconds;
    return rejectUnavailable();
  }
}

function rejectUnavailable(): Promise<never> {
  return Promise.reject(unavailable());
}

function unavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException('Cache unavailable');
}
