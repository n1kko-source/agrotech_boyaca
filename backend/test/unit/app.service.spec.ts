import { AppService } from '../../src/app.service';
import { RedisOpsCounter } from '../../src/shared/redis/redis-ops.counter';

describe('AppService', () => {
  it('returns API greeting', () => {
    const service = new AppService(new RedisOpsCounter());
    expect(service.getHello()).toBe('AgroTech Boyacá API');
  });

  it('returns health payload with redis ops meter', () => {
    const ops = new RedisOpsCounter();
    ops.record(2);
    const service = new AppService(ops);
    const health = service.getHealth();
    expect(health.status).toBe('ok');
    expect(health.service).toBe('agrotech-backend');
    expect(health.timestamp).toEqual(expect.any(String));
    expect(health.redis.ops).toBe(2);
    expect(health.redis.limit).toBe(10_000);
    expect(health.redis.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
