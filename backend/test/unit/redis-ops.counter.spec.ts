import { RedisOpsCounter } from '../../src/shared/redis/redis-ops.counter';

describe('RedisOpsCounter', () => {
  it('counts ops and resets on explicit reset', () => {
    const counter = new RedisOpsCounter();
    counter.record(3);
    counter.record();
    expect(counter.snapshot().ops).toBe(4);
    expect(counter.snapshot().limit).toBe(10_000);
    counter.reset();
    expect(counter.snapshot().ops).toBe(0);
  });
});
