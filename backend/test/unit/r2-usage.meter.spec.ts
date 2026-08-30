import {
  R2_READS_MONTHLY_LIMIT,
  R2_STORAGE_LIMIT_BYTES,
} from '../../src/guias/guias.constants';
import { R2UsageMeter } from '../../src/guias/r2-usage.meter';

describe('R2UsageMeter', () => {
  it('tracks storage and monthly reads', () => {
    const meter = new R2UsageMeter();
    meter.addStorage(2048);
    meter.recordRead();
    meter.recordRead();
    const snap = meter.snapshot();
    expect(snap.storageBytes).toBe(2048);
    expect(snap.storageLimit).toBe(R2_STORAGE_LIMIT_BYTES);
    expect(snap.reads).toBe(2);
    expect(snap.readsLimit).toBe(R2_READS_MONTHLY_LIMIT);
    expect(snap.month).toMatch(/^\d{4}-\d{2}$/);
    expect(meter.wouldExceedStorage(R2_STORAGE_LIMIT_BYTES)).toBe(true);
    meter.removeStorage(2048);
    expect(meter.snapshot().storageBytes).toBe(0);
  });

  it('hydrates from the store once', async () => {
    const store = {
      sumSizeBytes: jest.fn().mockResolvedValue(500),
      readsForMonth: jest.fn().mockResolvedValue(7),
      incrementReads: jest.fn().mockResolvedValue(undefined),
    };
    const meter = new R2UsageMeter(store as never);
    await meter.hydrate();
    await meter.hydrate();
    expect(store.sumSizeBytes).toHaveBeenCalledTimes(1);
    expect(meter.snapshot().storageBytes).toBe(500);
    expect(meter.snapshot().reads).toBe(7);
    meter.recordRead();
    expect(store.incrementReads).toHaveBeenCalled();
    expect(meter.snapshot().reads).toBe(8);
  });
});
