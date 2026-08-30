import {
  parseRangeHeader,
  contentRangeHeader,
  unsatisfiableContentRange,
} from '../../src/guias/byte-range';

describe('parseRangeHeader', () => {
  it('returns full when header is missing', () => {
    expect(parseRangeHeader(undefined, 100)).toEqual({ type: 'full' });
  });

  it('parses closed range', () => {
    expect(parseRangeHeader('bytes=0-9', 100)).toEqual({
      type: 'partial',
      range: { start: 0, end: 9 },
    });
  });

  it('parses open-ended range', () => {
    expect(parseRangeHeader('bytes=50-', 100)).toEqual({
      type: 'partial',
      range: { start: 50, end: 99 },
    });
  });

  it('parses suffix range', () => {
    expect(parseRangeHeader('bytes=-10', 100)).toEqual({
      type: 'partial',
      range: { start: 90, end: 99 },
    });
  });

  it('clamps end past the last byte', () => {
    expect(parseRangeHeader('bytes=0-999', 50)).toEqual({
      type: 'partial',
      range: { start: 0, end: 49 },
    });
  });

  it('is unsatisfiable when start is past size', () => {
    expect(parseRangeHeader('bytes=100-200', 50)).toEqual({
      type: 'unsatisfiable',
    });
  });

  it('ignores multiple ranges and invalid syntax', () => {
    expect(parseRangeHeader('bytes=0-1,2-3', 100)).toEqual({ type: 'full' });
    expect(parseRangeHeader('items=0-1', 100)).toEqual({ type: 'full' });
  });

  it('formats Content-Range headers', () => {
    expect(contentRangeHeader({ start: 0, end: 9 }, 100)).toBe('bytes 0-9/100');
    expect(unsatisfiableContentRange(100)).toBe('bytes */100');
  });
});
