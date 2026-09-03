import {
  SUSCRIPCION_GRACE_MS,
  SUSCRIPCION_PERIOD_MS,
} from '../../src/suscripciones/suscripciones.constants';
import {
  graceEndsAt,
  inExpiryReminderWindow,
  isListed,
  nextPeriodEnd,
  subscriptionStatus,
} from '../../src/suscripciones/subscription-status';

const T0 = new Date('2026-09-01T12:00:00.000Z');
const PERIOD_END = new Date(T0.getTime() + SUSCRIPCION_PERIOD_MS);

describe('subscriptionStatus', () => {
  it('is vencida without a period end', () => {
    expect(subscriptionStatus(null, T0)).toBe('vencida');
    expect(isListed(null, T0)).toBe(false);
  });

  it('is activa on period end inclusive', () => {
    expect(subscriptionStatus(PERIOD_END, T0)).toBe('activa');
    expect(subscriptionStatus(PERIOD_END, PERIOD_END)).toBe('activa');
    expect(isListed(PERIOD_END, PERIOD_END)).toBe(true);
  });

  it('enters grace one millisecond after period end', () => {
    const firstGrace = new Date(PERIOD_END.getTime() + 1);
    expect(subscriptionStatus(PERIOD_END, firstGrace)).toBe('en_gracia');
    expect(isListed(PERIOD_END, firstGrace)).toBe(true);
  });

  it('stays listed through the last millisecond of grace', () => {
    const lastGrace = new Date(PERIOD_END.getTime() + SUSCRIPCION_GRACE_MS);
    expect(subscriptionStatus(PERIOD_END, lastGrace)).toBe('en_gracia');
    expect(isListed(PERIOD_END, lastGrace)).toBe(true);
  });

  it('hides after grace', () => {
    const hidden = new Date(PERIOD_END.getTime() + SUSCRIPCION_GRACE_MS + 1);
    expect(subscriptionStatus(PERIOD_END, hidden)).toBe('vencida');
    expect(isListed(PERIOD_END, hidden)).toBe(false);
  });
});

describe('nextPeriodEnd', () => {
  it('extends from the remaining end when paying early', () => {
    const remaining = new Date(T0.getTime() + 3 * 24 * 60 * 60 * 1000);
    expect(nextPeriodEnd(T0, remaining).getTime()).toBe(
      remaining.getTime() + SUSCRIPCION_PERIOD_MS,
    );
  });

  it('starts from now when expired or missing', () => {
    const expired = new Date(T0.getTime() - 1);
    expect(nextPeriodEnd(T0, expired).getTime()).toBe(
      T0.getTime() + SUSCRIPCION_PERIOD_MS,
    );
    expect(nextPeriodEnd(T0, null).getTime()).toBe(
      T0.getTime() + SUSCRIPCION_PERIOD_MS,
    );
  });
});

describe('reminder window', () => {
  it('opens three days before period end and closes at period end', () => {
    const open = new Date(PERIOD_END.getTime() - 3 * 24 * 60 * 60 * 1000);
    expect(inExpiryReminderWindow(PERIOD_END, open)).toBe(true);
    expect(inExpiryReminderWindow(PERIOD_END, PERIOD_END)).toBe(false);
    expect(
      inExpiryReminderWindow(PERIOD_END, new Date(open.getTime() - 1)),
    ).toBe(false);
  });

  it('computes graceEndsAt as periodEnd + 4 days', () => {
    expect(graceEndsAt(PERIOD_END)?.getTime()).toBe(
      PERIOD_END.getTime() + SUSCRIPCION_GRACE_MS,
    );
    expect(graceEndsAt(null)).toBeNull();
  });
});
