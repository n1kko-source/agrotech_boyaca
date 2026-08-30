import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  R2_READS_MONTHLY_LIMIT,
  R2_STORAGE_LIMIT_BYTES,
  utcMonth,
} from './guias.constants';
import { GUIAS_STORE } from './guias.store';
import type { GuiasStore } from './guias.store';

export type R2UsageSnapshot = {
  storageBytes: number;
  storageLimit: number;
  reads: number;
  readsLimit: number;
  month: string;
};

@Injectable()
export class R2UsageMeter {
  private readonly logger = new Logger(R2UsageMeter.name);
  private storageBytes = 0;
  private reads = 0;
  private month = utcMonth();
  private warned80Storage = false;
  private warnedLimitStorage = false;
  private warned80Reads = false;
  private warnedLimitReads = false;
  private hydrated = false;

  constructor(
    @Optional() @Inject(GUIAS_STORE) private readonly store?: GuiasStore,
  ) {}

  async hydrate(): Promise<void> {
    if (this.hydrated) {
      return;
    }
    this.hydrated = true;
    if (!this.store) {
      return;
    }
    try {
      this.storageBytes = await this.store.sumSizeBytes();
      this.month = utcMonth();
      this.reads = await this.store.readsForMonth(this.month);
    } catch {
      this.logger.warn('r2 meter hydrate failed; starting at zero');
    }
  }

  addStorage(bytes: number): void {
    this.storageBytes += bytes;
    this.warnStorage();
  }

  removeStorage(bytes: number): void {
    this.storageBytes = Math.max(0, this.storageBytes - bytes);
  }

  wouldExceedStorage(additionalBytes: number): boolean {
    return this.storageBytes + additionalBytes > R2_STORAGE_LIMIT_BYTES;
  }

  recordRead(): void {
    this.rollIfNeeded();
    this.reads += 1;
    this.warnReads();
    void this.store?.incrementReads(this.month).catch(() => undefined);
  }

  snapshot(): R2UsageSnapshot {
    this.rollIfNeeded();
    return {
      storageBytes: this.storageBytes,
      storageLimit: R2_STORAGE_LIMIT_BYTES,
      reads: this.reads,
      readsLimit: R2_READS_MONTHLY_LIMIT,
      month: this.month,
    };
  }

  reset(): void {
    this.storageBytes = 0;
    this.reads = 0;
    this.month = utcMonth();
    this.warned80Storage = false;
    this.warnedLimitStorage = false;
    this.warned80Reads = false;
    this.warnedLimitReads = false;
    this.hydrated = false;
  }

  private rollIfNeeded(): void {
    const current = utcMonth();
    if (current === this.month) {
      return;
    }
    this.month = current;
    this.reads = 0;
    this.warned80Reads = false;
    this.warnedLimitReads = false;
  }

  private warnStorage(): void {
    const limit = R2_STORAGE_LIMIT_BYTES;
    if (!this.warned80Storage && this.storageBytes >= limit * 0.8) {
      this.warned80Storage = true;
      this.logger.warn(
        `r2 storage ${this.storageBytes}/${limit} (80% of 10GB cap)`,
      );
    }
    if (!this.warnedLimitStorage && this.storageBytes >= limit) {
      this.warnedLimitStorage = true;
      this.logger.warn(`r2 storage ${this.storageBytes}/${limit} (10GB cap)`);
    }
  }

  private warnReads(): void {
    const limit = R2_READS_MONTHLY_LIMIT;
    if (!this.warned80Reads && this.reads >= limit * 0.8) {
      this.warned80Reads = true;
      this.logger.warn(
        `r2 reads ${this.reads}/${limit} (80% of monthly Class B cap)`,
      );
    }
    if (!this.warnedLimitReads && this.reads >= limit) {
      this.warnedLimitReads = true;
      this.logger.warn(`r2 reads ${this.reads}/${limit} (monthly Class B cap)`);
    }
  }
}
