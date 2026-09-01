import { LWW_SKEW_MS } from '../../src/sync/sync.constants';
import { decideLww, parseTimestamp } from '../../src/sync/lww';

describe('decideLww', () => {
  const now = new Date('2026-09-01T12:00:00.000Z');

  it('applies when there is no server clock', () => {
    expect(
      decideLww({
        clientTs: new Date('2026-09-01T09:00:00.000Z'),
        serverTs: null,
        now,
      }),
    ).toBe('apply');
  });

  it('applies hours-old offline timestamps (skew is not a TTL)', () => {
    expect(
      decideLww({
        clientTs: new Date('2026-08-31T12:00:00.000Z'),
        serverTs: new Date('2026-08-30T12:00:00.000Z'),
        now,
      }),
    ).toBe('apply');
  });

  it('lets the later client timestamp win', () => {
    expect(
      decideLww({
        clientTs: new Date('2026-09-01T11:00:00.000Z'),
        serverTs: new Date('2026-09-01T10:00:00.000Z'),
        now,
      }),
    ).toBe('apply');
  });

  it('conflicts when the server clock is newer or equal', () => {
    expect(
      decideLww({
        clientTs: new Date('2026-09-01T10:00:00.000Z'),
        serverTs: new Date('2026-09-01T11:00:00.000Z'),
        now,
      }),
    ).toBe('conflict');
    expect(
      decideLww({
        clientTs: new Date('2026-09-01T11:00:00.000Z'),
        serverTs: new Date('2026-09-01T11:00:00.000Z'),
        now,
      }),
    ).toBe('conflict');
  });

  it('rejects a client clock more than 5 minutes in the future', () => {
    expect(
      decideLww({
        clientTs: new Date(now.getTime() + LWW_SKEW_MS + 1),
        serverTs: null,
        now,
      }),
    ).toBe('reject_clock');
  });

  it('allows a client clock inside the 5-minute skew window', () => {
    expect(
      decideLww({
        clientTs: new Date(now.getTime() + LWW_SKEW_MS - 1),
        serverTs: null,
        now,
      }),
    ).toBe('apply');
  });

  it('rejects an invalid timestamp', () => {
    expect(
      decideLww({
        clientTs: new Date('not-a-date'),
        serverTs: null,
        now,
      }),
    ).toBe('reject_clock');
    expect(parseTimestamp('nope')).toBeNull();
    expect(parseTimestamp('2026-09-01T12:00:00.000Z')?.toISOString()).toBe(
      '2026-09-01T12:00:00.000Z',
    );
  });
});
