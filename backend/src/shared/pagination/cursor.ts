import { BadRequestException } from '@nestjs/common';

export type CursorPayload = {
  id: string;
  t: number;
};

export type Paginated<T> = {
  items: T[];
  nextCursor: string | null;
};

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): CursorPayload {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as CursorPayload;
    if (typeof parsed.id !== 'string' || typeof parsed.t !== 'number') {
      throw new Error('shape');
    }
    return parsed;
  } catch {
    throw new BadRequestException('Invalid cursor');
  }
}

export function paginate<T extends { id: string; t: number }>(
  rows: T[],
  limit: number,
): Paginated<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items,
    nextCursor:
      hasMore && last ? encodeCursor({ id: last.id, t: last.t }) : null,
  };
}
