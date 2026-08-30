import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from '../../src/app.controller';
import { AppService } from '../../src/app.service';
import { R2UsageMeter } from '../../src/guias/r2-usage.meter';
import { RedisOpsCounter } from '../../src/shared/redis/redis-ops.counter';

describe('AppController (integration)', () => {
  let controller: AppController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, RedisOpsCounter, R2UsageMeter],
    }).compile();

    controller = module.get<AppController>(AppController);
  });

  it('GET / returns greeting', () => {
    expect(controller.getHello()).toBe('AgroTech Boyacá API');
  });

  it('GET /health returns ok', () => {
    const health = controller.getHealth();
    expect(health.status).toBe('ok');
    expect(health.service).toBe('agrotech-backend');
    expect(health.redis.limit).toBe(10_000);
    expect(health.r2.storageLimit).toBe(10 * 1024 * 1024 * 1024);
    expect(health.r2.readsLimit).toBe(1_000_000);
  });
});
