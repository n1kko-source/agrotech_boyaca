import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from '../../src/app.controller';
import { AppService } from '../../src/app.service';
import { RedisOpsCounter } from '../../src/shared/redis/redis-ops.counter';

describe('AppController (integration)', () => {
  let controller: AppController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, RedisOpsCounter],
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
  });
});
