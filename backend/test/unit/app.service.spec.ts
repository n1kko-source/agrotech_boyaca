import { AppService } from '../../src/app.service';
import { R2UsageMeter } from '../../src/guias/r2-usage.meter';
import { RedisOpsCounter } from '../../src/shared/redis/redis-ops.counter';

describe('AppService', () => {
  it('returns API greeting', () => {
    const service = new AppService(new RedisOpsCounter(), new R2UsageMeter());
    expect(service.getHello()).toBe('AgroTech Boyacá API');
  });

  it('returns health payload with redis ops meter', () => {
    const ops = new RedisOpsCounter();
    ops.record(2);
    const r2 = new R2UsageMeter();
    r2.addStorage(100);
    r2.recordRead();
    const service = new AppService(ops, r2);
    const health = service.getHealth();
    expect(health.status).toBe('ok');
    expect(health.service).toBe('agrotech-backend');
    expect(health.timestamp).toEqual(expect.any(String));
    expect(health.redis.ops).toBe(2);
    expect(health.redis.limit).toBe(10_000);
    expect(health.redis.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(health.r2.storageBytes).toBe(100);
    expect(health.r2.storageLimit).toBe(10 * 1024 * 1024 * 1024);
    expect(health.r2.reads).toBe(1);
    expect(health.r2.readsLimit).toBe(1_000_000);
    expect(health.r2.month).toMatch(/^\d{4}-\d{2}$/);
  });
});
