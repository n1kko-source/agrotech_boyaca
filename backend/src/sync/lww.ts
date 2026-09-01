import { LWW_SKEW_MS } from './sync.constants';

export type LwwDecision = 'apply' | 'conflict' | 'reject_clock';

/**
 * Last-Write-Wins. `clientTs` is the device clock of the queued write.
 * The 5-minute window is clock-skew: a timestamp more than 5 min in the
 * future is rejected. Hours-old offline timestamps still apply.
 */
export function decideLww(input: {
  clientTs: Date;
  serverTs: Date | null;
  now: Date;
  skewMs?: number;
}): LwwDecision {
  const clientMs = input.clientTs.getTime();
  if (Number.isNaN(clientMs)) {
    return 'reject_clock';
  }
  const skewMs = input.skewMs ?? LWW_SKEW_MS;
  if (clientMs > input.now.getTime() + skewMs) {
    return 'reject_clock';
  }
  if (input.serverTs === null) {
    return 'apply';
  }
  const serverMs = input.serverTs.getTime();
  if (Number.isNaN(serverMs) || clientMs > serverMs) {
    return 'apply';
  }
  return 'conflict';
}

export function parseTimestamp(value: string): Date | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}
