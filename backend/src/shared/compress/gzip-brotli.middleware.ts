import type { NextFunction, Request, Response } from 'express';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const THRESHOLD_BYTES = 1024;

function toBuffer(chunk: unknown, encoding?: BufferEncoding): Buffer {
  if (chunk == null) {
    return Buffer.alloc(0);
  }
  if (Buffer.isBuffer(chunk)) {
    return chunk;
  }
  if (typeof chunk === 'string') {
    return Buffer.from(chunk, encoding ?? 'utf8');
  }
  return Buffer.from(chunk as Uint8Array);
}

export function gzipBrotliMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const accept = String(req.headers['accept-encoding'] ?? '');
  const useBr = /\bbr\b/.test(accept);
  const useGzip = /\bgzip\b/.test(accept);
  if (!useBr && !useGzip) {
    next();
    return;
  }

  const chunks: Buffer[] = [];
  const originalEnd = res.end.bind(res);

  const capture = (chunk: unknown, encoding?: BufferEncoding) => {
    if (chunk) {
      chunks.push(toBuffer(chunk, encoding));
    }
  };

  res.write = ((chunk: unknown, encoding?: unknown, cb?: unknown) => {
    capture(
      chunk,
      typeof encoding === 'string' ? (encoding as BufferEncoding) : undefined,
    );
    if (typeof encoding === 'function') {
      (encoding as () => void)();
    }
    if (typeof cb === 'function') {
      (cb as () => void)();
    }
    return true;
  }) as Response['write'];

  res.end = ((chunk?: unknown, encoding?: unknown, cb?: unknown) => {
    capture(
      chunk,
      typeof encoding === 'string' ? (encoding as BufferEncoding) : undefined,
    );
    const body = chunks.length ? Buffer.concat(chunks) : Buffer.alloc(0);
    const callback =
      typeof encoding === 'function'
        ? encoding
        : typeof cb === 'function'
          ? cb
          : undefined;

    if (
      res.headersSent ||
      body.length < THRESHOLD_BYTES ||
      res.getHeader('Content-Encoding')
    ) {
      return originalEnd(body, callback as () => void);
    }

    const encodingName = useBr ? 'br' : 'gzip';
    const compressed =
      encodingName === 'br'
        ? brotliCompressSync(body, {
            params: { [constants.BROTLI_PARAM_QUALITY]: 4 },
          })
        : gzipSync(body);

    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('Content-Encoding', encodingName);
    res.setHeader('Content-Length', String(compressed.length));
    return originalEnd(compressed, callback as () => void);
  }) as Response['end'];

  next();
}
