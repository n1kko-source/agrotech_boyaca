import { Injectable, Logger } from '@nestjs/common';

/** Upstash Free: 10.000 commands/day. Counted in-process so the meter is not itself a Redis INCR. */
export const REDIS_DAILY_OPS_LIMIT = 10_000;
const WARN_AT = Math.floor(REDIS_DAILY_OPS_LIMIT * 0.8);

@Injectable()
export class RedisOpsCounter {
  private readonly logger = new Logger(RedisOpsCounter.name);
  private day = utcDay();
  private ops = 0;
  private warned80 = false;
  private warnedLimit = false;

  record(n = 1): void {
    this.rollIfNeeded();
    this.ops += n;
    if (!this.warned80 && this.ops >= WARN_AT) {
      this.warned80 = true;
      this.logger.warn(
        `redis ops ${this.ops}/${REDIS_DAILY_OPS_LIMIT} (80% of daily Upstash cap)`,
      );
    }
    if (!this.warnedLimit && this.ops >= REDIS_DAILY_OPS_LIMIT) {
      this.warnedLimit = true;
      this.logger.warn(
        `redis ops ${this.ops}/${REDIS_DAILY_OPS_LIMIT} (daily Upstash cap reached)`,
      );
    }
  }

  snapshot(): RedisOpsSnapshot {
    this.rollIfNeeded();
    return {
      ops: this.ops,
      day: this.day,
      limit: REDIS_DAILY_OPS_LIMIT,
    };
  }

  reset(): void {
    this.day = utcDay();
    this.ops = 0;
    this.warned80 = false;
    this.warnedLimit = false;
  }

  private rollIfNeeded(): void {
    const today = utcDay();
    if (today === this.day) {
      return;
    }
    this.day = today;
    this.ops = 0;
    this.warned80 = false;
    this.warnedLimit = false;
  }
}

export type RedisOpsSnapshot = {
  ops: number;
  day: string;
  limit: number;
};

function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
