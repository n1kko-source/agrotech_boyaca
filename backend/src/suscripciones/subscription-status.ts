import {
  SUSCRIPCION_GRACE_MS,
  SUSCRIPCION_PERIOD_MS,
  SUSCRIPCION_REMIND_BEFORE_MS,
  type SubscriptionStatus,
} from './suscripciones.constants';

export function subscriptionStatus(
  periodEnd: Date | null,
  now: Date,
): SubscriptionStatus {
  if (!periodEnd) {
    return 'vencida';
  }
  const t = now.getTime();
  const end = periodEnd.getTime();
  if (t <= end) {
    return 'activa';
  }
  if (t <= end + SUSCRIPCION_GRACE_MS) {
    return 'en_gracia';
  }
  return 'vencida';
}

export function isListed(periodEnd: Date | null, now: Date): boolean {
  const status = subscriptionStatus(periodEnd, now);
  return status === 'activa' || status === 'en_gracia';
}

export function graceEndsAt(periodEnd: Date | null): Date | null {
  if (!periodEnd) {
    return null;
  }
  return new Date(periodEnd.getTime() + SUSCRIPCION_GRACE_MS);
}

/** Pay early keeps remaining days. In grace/expired, the month starts now. */
export function nextPeriodEnd(now: Date, currentEnd: Date | null): Date {
  const base =
    currentEnd && currentEnd.getTime() > now.getTime() ? currentEnd : now;
  return new Date(base.getTime() + SUSCRIPCION_PERIOD_MS);
}

export function inExpiryReminderWindow(periodEnd: Date, now: Date): boolean {
  const t = now.getTime();
  const end = periodEnd.getTime();
  return t >= end - SUSCRIPCION_REMIND_BEFORE_MS && t < end;
}

export function sameInstant(left: Date | null, right: Date): boolean {
  return left !== null && left.getTime() === right.getTime();
}
