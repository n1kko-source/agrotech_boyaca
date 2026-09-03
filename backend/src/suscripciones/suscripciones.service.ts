import { createHash, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { USERS_REPOSITORY } from '../auth/users/users.repository';
import type { UsersRepository } from '../auth/users/users.repository';
import { NotificationService } from '../notifications/notifications.service';
import { Role } from '../shared/auth/role.enum';
import { CLOCK, systemClock, type Clock } from './clock';
import {
  inExpiryReminderWindow,
  graceEndsAt,
  nextPeriodEnd,
  sameInstant,
  subscriptionStatus,
} from './subscription-status';
import type { PaymentChannel } from './suscripciones.constants';
import {
  SUBSCRIPTIONS_STORE,
  type SubscriptionRecord,
  type SubscriptionsStore,
} from './subscriptions.store';

export type SubscriptionView = {
  status: ReturnType<typeof subscriptionStatus>;
  currentPeriodEnd: string | null;
  graceEndsAt: string | null;
};

export type EvaluateResult = {
  evaluated: number;
  fired: number;
};

@Injectable()
export class SuscripcionesService {
  constructor(
    @Inject(SUBSCRIPTIONS_STORE) private readonly store: SubscriptionsStore,
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    private readonly notifications: NotificationService,
    private readonly config: ConfigService,
    @Optional() @Inject(CLOCK) clock?: Clock,
  ) {
    this.clock = clock ?? systemClock;
  }

  private readonly clock: Clock;

  async me(userId: string): Promise<SubscriptionView> {
    const row = await this.store.findByUserId(userId);
    return toView(row, this.clock());
  }

  async recordPayment(
    actorId: string,
    targetUserId: string,
    input: { channel: PaymentChannel; reference?: string },
  ): Promise<SubscriptionView> {
    const target = await this.users.findById(targetUserId);
    if (!target) {
      throw new NotFoundException('User not found');
    }
    if (target.role !== Role.NATURAL && target.role !== Role.JURIDICA) {
      throw new BadRequestException('User cannot be subscribed');
    }
    const reference = normalizeReference(input.reference);
    if (reference) {
      const existing = await this.store.findPayment(
        targetUserId,
        input.channel,
        reference,
      );
      if (existing) {
        throw new ConflictException('Payment already recorded');
      }
    }
    const now = this.clock();
    const current = await this.store.findByUserId(targetUserId);
    const periodEndAfter = nextPeriodEnd(
      now,
      current?.currentPeriodEnd ?? null,
    );
    try {
      await this.store.insertPayment({
        actorId,
        targetUserId,
        channel: input.channel,
        reference,
        periodEndAfter,
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('Payment already recorded');
      }
      throw err;
    }
    const row = await this.store.upsert({
      userId: targetUserId,
      currentPeriodEnd: periodEndAfter,
      remindedExpiryAt: null,
      remindedGraceAt: null,
      remindedHiddenAt: null,
    });
    return toView(row, now);
  }

  async grant(userId: string): Promise<SubscriptionView> {
    const target = await this.users.findById(userId);
    if (!target) {
      throw new NotFoundException('User not found');
    }
    if (target.role !== Role.NATURAL && target.role !== Role.JURIDICA) {
      throw new BadRequestException('User cannot be subscribed');
    }
    const now = this.clock();
    const current = await this.store.findByUserId(userId);
    const periodEndAfter = nextPeriodEnd(
      now,
      current?.currentPeriodEnd ?? null,
    );
    const row = await this.store.upsert({
      userId,
      currentPeriodEnd: periodEndAfter,
      remindedExpiryAt: null,
      remindedGraceAt: null,
      remindedHiddenAt: null,
    });
    return toView(row, now);
  }

  assertJobSecret(provided: string | undefined): void {
    const expected = this.config
      .get<string>('SUSCRIPCIONES_JOB_SECRET')
      ?.trim();
    if (!expected || !provided || !secretsEqual(provided, expected)) {
      throw new UnauthorizedException('Unauthorized');
    }
  }

  async evaluate(): Promise<EvaluateResult> {
    const now = this.clock();
    const rows = await this.store.listAll();
    let fired = 0;
    for (const row of rows) {
      const sent = await this.maybeRemind(row, now);
      fired += sent;
    }
    return { evaluated: rows.length, fired };
  }

  private async maybeRemind(
    row: SubscriptionRecord,
    now: Date,
  ): Promise<number> {
    const status = subscriptionStatus(row.currentPeriodEnd, now);
    const end = row.currentPeriodEnd;
    let patch: Partial<
      Pick<
        SubscriptionRecord,
        'remindedExpiryAt' | 'remindedGraceAt' | 'remindedHiddenAt'
      >
    > = {};
    let fired = 0;

    if (
      status === 'activa' &&
      inExpiryReminderWindow(end, now) &&
      !sameInstant(row.remindedExpiryAt, end)
    ) {
      await this.notifications.send(row.userId, {
        title: 'Tu listado vence pronto',
        body: 'Tu suscripción vence en pocos días. Paga por Nequi, Daviplata o transferencia para seguir visible.',
        data: { type: 'suscripcion', kind: 'expiry_soon' },
      });
      patch = { ...patch, remindedExpiryAt: end };
      fired += 1;
    }

    if (status === 'en_gracia' && !sameInstant(row.remindedGraceAt, end)) {
      await this.notifications.send(row.userId, {
        title: 'Estás en periodo de gracia',
        body: 'Tu listado sigue visible unos días. Si no se registra el pago, se oculta del marketplace.',
        data: { type: 'suscripcion', kind: 'grace' },
      });
      patch = { ...patch, remindedGraceAt: end };
      fired += 1;
    }

    if (status === 'vencida' && !sameInstant(row.remindedHiddenAt, end)) {
      await this.notifications.send(row.userId, {
        title: 'Tu listado ya no es público',
        body: 'Tu suscripción venció. Los anuncios se ocultaron del marketplace hasta que se registre un pago.',
        data: { type: 'suscripcion', kind: 'hidden' },
      });
      patch = { ...patch, remindedHiddenAt: end };
      fired += 1;
    }

    if (fired > 0) {
      await this.store.upsert({
        userId: row.userId,
        currentPeriodEnd: row.currentPeriodEnd,
        remindedExpiryAt: patch.remindedExpiryAt ?? row.remindedExpiryAt,
        remindedGraceAt: patch.remindedGraceAt ?? row.remindedGraceAt,
        remindedHiddenAt: patch.remindedHiddenAt ?? row.remindedHiddenAt,
      });
    }
    return fired;
  }
}

export function toView(
  row: SubscriptionRecord | null,
  now: Date,
): SubscriptionView {
  const periodEnd = row?.currentPeriodEnd ?? null;
  const grace = graceEndsAt(periodEnd);
  const status = subscriptionStatus(periodEnd, now);
  return {
    status,
    currentPeriodEnd:
      status === 'vencida' && !row ? null : isoOrNull(periodEnd),
    graceEndsAt: status === 'vencida' && !row ? null : isoOrNull(grace),
  };
}

function isoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function normalizeReference(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object' || !('code' in err)) {
    return false;
  }
  const code = (err as { code?: string }).code;
  return code === 'P2002' || code === '23505';
}

function secretsEqual(left: string, right: string): boolean {
  const a = createHash('sha256').update(left).digest();
  const b = createHash('sha256').update(right).digest();
  return timingSafeEqual(a, b);
}
