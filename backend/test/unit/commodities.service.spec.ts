import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type {
  AuthUser,
  UsersRepository,
} from '../../src/auth/users/users.repository';
import { CommoditiesService } from '../../src/commodities/commodities.service';
import { MemoryPricesStore } from '../../src/commodities/prices.store';
import { Role } from '../../src/shared/auth/role.enum';
import { CountingKvStore } from '../../src/shared/redis/counting-kv.store';
import { MemoryKvStore } from '../../src/shared/redis/memory-kv.store';
import { RedisOpsCounter } from '../../src/shared/redis/redis-ops.counter';

const REPORTER_ID = '11111111-1111-4111-8111-111111111111';

function usersStub(user: AuthUser | null): UsersRepository {
  return {
    findById: jest.fn().mockResolvedValue(user),
  } as unknown as UsersRepository;
}

function verifiedJuridica(): AuthUser {
  return {
    id: REPORTER_ID,
    role: Role.JURIDICA,
    verified: true,
    entityType: 'cooperativa',
  };
}

describe('CommoditiesService', () => {
  it('upserts, serves from Redis cache, and invalidates on a new price', async () => {
    const store = new MemoryPricesStore();
    const ops = new RedisOpsCounter();
    const kv = new CountingKvStore(new MemoryKvStore(), ops);
    const service = new CommoditiesService(
      store,
      kv,
      usersStub(verifiedJuridica()),
    );

    const written = await service.upsert(REPORTER_ID, {
      producto: 'Papa criolla',
      region: 'Siachoque',
      precio: 2800,
    });
    expect(written.producto).toBe('papa criolla');
    expect(written.region).toBe('siachoque');
    expect(written.cached).toBe(false);
    expect(written.moneda).toBe('COP');

    const miss = await service.get('papa criolla', 'siachoque');
    expect(miss.cached).toBe(false);
    expect(miss.precio).toBe(2800);

    const hit = await service.get('Papa  Criolla', 'SIACHOQUE');
    expect(hit.cached).toBe(true);
    expect(hit.precio).toBe(2800);

    const opsAfterHit = ops.snapshot().ops;
    await service.upsert(REPORTER_ID, {
      producto: 'papa criolla',
      region: 'siachoque',
      precio: 3100,
    });
    const afterUpdate = await service.get('papa criolla', 'siachoque');
    expect(afterUpdate.cached).toBe(false);
    expect(afterUpdate.precio).toBe(3100);
    expect(ops.snapshot().ops).toBeGreaterThan(opsAfterHit);
  });

  it('rejects NATURAL and unverified JURIDICA on upsert', async () => {
    const store = new MemoryPricesStore();
    const kv = new MemoryKvStore();
    const natural = new CommoditiesService(
      store,
      kv,
      usersStub({
        id: REPORTER_ID,
        role: Role.NATURAL,
        verified: true,
      }),
    );
    await expect(
      natural.upsert(REPORTER_ID, {
        producto: 'papa',
        region: 'tunja',
        precio: 1000,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const pending = new CommoditiesService(
      store,
      kv,
      usersStub({
        id: REPORTER_ID,
        role: Role.JURIDICA,
        verified: false,
        entityType: 'empresa',
      }),
    );
    await expect(
      pending.upsert(REPORTER_ID, {
        producto: 'papa',
        region: 'tunja',
        precio: 1000,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns 404 when there is no price for the pair', async () => {
    const service = new CommoditiesService(
      new MemoryPricesStore(),
      new MemoryKvStore(),
      usersStub(verifiedJuridica()),
    );
    await expect(service.get('papa', 'duitama')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('serves from Postgres when Redis get fails (fail-open)', async () => {
    const store = new MemoryPricesStore();
    await store.upsert({
      producto: 'cebolla',
      region: 'ramiriqui',
      precio: 1500,
      unidad: 'kg',
      reportedBy: REPORTER_ID,
    });
    const brokenKv = {
      get: jest.fn().mockRejectedValue(new Error('down')),
      set: jest.fn().mockRejectedValue(new Error('down')),
      del: jest.fn().mockResolvedValue(undefined),
      getdel: jest.fn(),
      incr: jest.fn(),
    };
    const service = new CommoditiesService(
      store,
      brokenKv,
      usersStub(verifiedJuridica()),
    );
    const view = await service.get('cebolla', 'ramiriqui');
    expect(view.precio).toBe(1500);
    expect(view.cached).toBe(false);
  });
});
