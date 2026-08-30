export type ByteRange = {
  start: number;
  end: number;
};

export type RangeResult =
  | { type: 'full' }
  | { type: 'partial'; range: ByteRange }
  | { type: 'unsatisfiable' };

/**
 * Single RFC 7233 bytes range. Multiple ranges (comma) are ignored → full body.
 * Invalid syntax is ignored → full body (clients still get the file).
 */
export function parseRangeHeader(
  header: string | undefined,
  size: number,
): RangeResult {
  if (!header || size <= 0) {
    return { type: 'full' };
  }
  const trimmed = header.trim();
  if (!trimmed.toLowerCase().startsWith('bytes=')) {
    return { type: 'full' };
  }
  const spec = trimmed.slice('bytes='.length);
  if (spec.includes(',')) {
    return { type: 'full' };
  }
  const match = /^(\d*)-(\d*)$/.exec(spec);
  if (!match) {
    return { type: 'full' };
  }
  const startRaw = match[1] ?? '';
  const endRaw = match[2] ?? '';
  if (startRaw === '' && endRaw === '') {
    return { type: 'full' };
  }

  let start: number;
  let end: number;
  if (startRaw === '') {
    const suffix = Number(endRaw);
    if (!Number.isFinite(suffix) || suffix <= 0) {
      return { type: 'unsatisfiable' };
    }
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(startRaw);
    end = endRaw === '' ? size - 1 : Number(endRaw);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0) {
      return { type: 'unsatisfiable' };
    }
  }

  if (start >= size || start > end) {
    return { type: 'unsatisfiable' };
  }
  end = Math.min(end, size - 1);
  return { type: 'partial', range: { start, end } };
}

export function contentRangeHeader(range: ByteRange, size: number): string {
  return `bytes ${range.start}-${range.end}/${size}`;
}

export function unsatisfiableContentRange(size: number): string {
  return `bytes */${size}`;
}
