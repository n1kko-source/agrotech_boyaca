import {
  encodeCursor,
  decodeCursor,
  paginate,
} from '../../src/shared/pagination/cursor';
import { BadRequestException } from '@nestjs/common';

describe('cursor pagination', () => {
  it('round-trips id and timestamp', () => {
    const payload = { id: 'abc', t: 1_700_000_000 };
    expect(decodeCursor(encodeCursor(payload))).toEqual(payload);
  });

  it('rejects tampered cursor', () => {
    expect(() => decodeCursor('not-a-cursor')).toThrow(BadRequestException);
  });

  it('rejects cursor with invalid payload shape', () => {
    const bogus = Buffer.from(
      JSON.stringify({ id: 1, t: 'x' }),
      'utf8',
    ).toString('base64url');
    expect(() => decodeCursor(bogus)).toThrow(BadRequestException);
  });

  it('builds nextCursor when there is another page', () => {
    const rows = [
      { id: '1', t: 1 },
      { id: '2', t: 2 },
      { id: '3', t: 3 },
    ];
    const page = paginate(rows, 2);
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBe(encodeCursor({ id: '2', t: 2 }));
  });

  it('returns null nextCursor on the last page', () => {
    const page = paginate([{ id: '1', t: 1 }], 20);
    expect(page.nextCursor).toBeNull();
  });
});
