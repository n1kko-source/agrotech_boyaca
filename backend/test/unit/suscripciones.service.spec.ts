import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { UsersRepository } from '../../src/auth/users/users.repository';
import { Role } from '../../src/shared/auth/role.enum';
import { NotificationService } from '../../src/notifications/notifications.service';
import { SUSCRIPCION_PERIOD_MS } from '../../src/suscripciones/suscripciones.constants';
import { SuscripcionesService } from '../../src/suscripciones/suscripciones.service';
import { MemorySubscriptionsStore } from '../../src/suscripciones/subscriptions.store';

const NATURAL = '11111111-1111-4111-8111-111111111111';
const ADMIN = '22222222-2222-4222-8222-222222222222';
const T0 = new Date('2026-09-01T12:00:00.000Z');

function usersStub(): UsersRepository {
  return {
    findById: (id: string) => {
      if (id === NATURAL) {
        return Promise.resolve({
          id: NATURAL,
          role: Role.NATURAL,
          verified: true,
        });
      }
      if (id === ADMIN) {
        return Promise.resolve({
          id: ADMIN,
          role: Role.ADMIN,
          verified: true,
        });
      }
      return Promise.resolve(null);
    },
  } as unknown as UsersRepository;
}

function notificationsStub(send = jest.fn()) {
  return { send } as unknown as NotificationService;
}

function service(opts?: {
  now?: { value: Date };
  send?: jest.Mock;
  jobSecret?: string;
}) {
  const now = opts?.now ?? { value: T0 };
  const store = new MemorySubscriptionsStore();
  const send =
    opts?.send ?? jest.fn().mockResolvedValue({ id: 'n-1', status: 'pending' });
  const config = {
    get: (key: string) =>
      key === 'SUSCRIPCIONES_JOB_SECRET'
        ? (opts?.jobSecret ?? 'job-secret')
        : undefined,
  } as ConfigService;
  const svc = new SuscripcionesService(
    store,
    usersStub(),
    notificationsStub(send),
    config,
    () => now.value,
  );
  return { svc, store, send, now };
}

describe('SuscripcionesService', () => {
  it('returns vencida with null dates when there is no row', async () => {
    const { svc } = service();
    await expect(svc.me(NATURAL)).resolves.toEqual({
      status: 'vencida',
      currentPeriodEnd: null,
      graceEndsAt: null,
    });
  });

  it('records a payment and extends from now when expired', async () => {
    const { svc } = service();
    const view = await svc.recordPayment(ADMIN, NATURAL, {
      channel: 'nequi',
      reference: 'ref-1',
    });
    expect(view.status).toBe('activa');
    expect(view.currentPeriodEnd).toBe(
      new Date(T0.getTime() + SUSCRIPCION_PERIOD_MS).toISOString(),
    );
  });

  it('keeps remaining days when paying early', async () => {
    const { svc, now } = service();
    await svc.recordPayment(ADMIN, NATURAL, { channel: 'nequi' });
    now.value = new Date(T0.getTime() + 3 * 24 * 60 * 60 * 1000);
    const view = await svc.recordPayment(ADMIN, NATURAL, {
      channel: 'daviplata',
    });
    const firstEnd = T0.getTime() + SUSCRIPCION_PERIOD_MS;
    expect(new Date(view.currentPeriodEnd ?? 0).getTime()).toBe(
      firstEnd + SUSCRIPCION_PERIOD_MS,
    );
  });

  it('rejects a reused reference with 409', async () => {
    const { svc } = service();
    await svc.recordPayment(ADMIN, NATURAL, {
      channel: 'nequi',
      reference: 'dup',
    });
    await expect(
      svc.recordPayment(ADMIN, NATURAL, {
        channel: 'nequi',
        reference: 'dup',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects ADMIN targets and missing users', async () => {
    const { svc } = service();
    await expect(
      svc.recordPayment(ADMIN, ADMIN, { channel: 'nequi' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.recordPayment(ADMIN, randomUUID(), { channel: 'nequi' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('fires each reminder once per period', async () => {
    const now = { value: T0 };
    const send = jest.fn().mockResolvedValue({ id: 'n-1', status: 'pending' });
    const { svc } = service({ now, send });
    await svc.recordPayment(ADMIN, NATURAL, { channel: 'nequi' });

    const periodEnd = new Date(T0.getTime() + SUSCRIPCION_PERIOD_MS);
    now.value = new Date(periodEnd.getTime() - 3 * 24 * 60 * 60 * 1000);
    expect(await svc.evaluate()).toEqual({ evaluated: 1, fired: 1 });
    expect(await svc.evaluate()).toEqual({ evaluated: 1, fired: 0 });

    now.value = new Date(periodEnd.getTime() + 1);
    expect(await svc.evaluate()).toEqual({ evaluated: 1, fired: 1 });
    expect(await svc.evaluate()).toEqual({ evaluated: 1, fired: 0 });

    now.value = new Date(periodEnd.getTime() + 4 * 24 * 60 * 60 * 1000 + 1);
    expect(await svc.evaluate()).toEqual({ evaluated: 1, fired: 1 });
    expect(await svc.evaluate()).toEqual({ evaluated: 1, fired: 0 });

    expect(send).toHaveBeenCalledTimes(3);
    expect(send).toHaveBeenNthCalledWith(
      1,
      NATURAL,
      expect.objectContaining({
        data: { type: 'suscripcion', kind: 'expiry_soon' },
      }),
    );
    expect(send).toHaveBeenNthCalledWith(
      2,
      NATURAL,
      expect.objectContaining({
        data: { type: 'suscripcion', kind: 'grace' },
      }),
    );
    expect(send).toHaveBeenNthCalledWith(
      3,
      NATURAL,
      expect.objectContaining({
        data: { type: 'suscripcion', kind: 'hidden' },
      }),
    );
  });

  it('rejects a missing job secret', () => {
    const { svc } = service({ jobSecret: 'expected-secret' });
    expect(() => svc.assertJobSecret(undefined)).toThrow(UnauthorizedException);
    expect(() => svc.assertJobSecret('wrong')).toThrow(UnauthorizedException);
    expect(() => svc.assertJobSecret('expected-secret')).not.toThrow();
  });
});
