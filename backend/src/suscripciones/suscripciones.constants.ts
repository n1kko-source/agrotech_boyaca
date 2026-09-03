export const SUSCRIPCION_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
export const SUSCRIPCION_GRACE_MS = 4 * 24 * 60 * 60 * 1000;
export const SUSCRIPCION_REMIND_BEFORE_MS = 3 * 24 * 60 * 60 * 1000;

export const PAYMENT_CHANNELS = [
  'nequi',
  'daviplata',
  'transferencia',
] as const;
export type PaymentChannel = (typeof PAYMENT_CHANNELS)[number];

export const SUBSCRIPTION_STATUSES = [
  'activa',
  'en_gracia',
  'vencida',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const SUSCRIPCION_JOB_SECRET_HEADER = 'x-suscripciones-job-secret';

export const REMINDER_KINDS = ['expiry_soon', 'grace', 'hidden'] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];
