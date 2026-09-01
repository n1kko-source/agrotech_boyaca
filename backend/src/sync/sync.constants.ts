export const LWW_SKEW_MS = 5 * 60 * 1000;
export const SYNC_OPS_MAX = 50;
export const SYNC_DELTA_LIMIT = 50;
export const SYNC_THROTTLE_LIMIT = 20;
export const SYNC_THROTTLE_TTL_MS = 60_000;

export const SYNC_ENTITIES = [
  'post',
  'profile',
  'conversation',
  'message',
  'alerta',
  'precio',
] as const;

export type SyncEntity = (typeof SYNC_ENTITIES)[number];

export const SYNC_OP_STATUSES = ['applied', 'conflict', 'rejected'] as const;

export type SyncOpStatus = (typeof SYNC_OP_STATUSES)[number];
