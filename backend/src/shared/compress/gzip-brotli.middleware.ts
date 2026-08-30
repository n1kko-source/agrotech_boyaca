import type { NextFunction, Request, Response } from 'express';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const THRESHOLD_BYTES = 1024;
const SKIP_CONTENT_TYPE =
  /^(application\/pdf|application\/octet-stream|audio\/|video\/|image\/)/i;

type CompressionLocals = { skipCompression?: boolean };

export function skipCompression(res: Response): void {
  (res.locals as CompressionLocals).skipCompression = true;
}

function shouldSkip(res: Response): boolean {
  if ((res.locals as CompressionLocals).skipCompression) {
    return true;
  }
  if (res.statusCode === 206 || res.statusCode === 416) {
    return true;
  }
  const contentType = String(res.getHeader('content-type') ?? '');
  return SKIP_CONTENT_TYPE.test(contentType);
}

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
  const originalWrite = res.write.bind(res) as (
    chunk?: unknown,
    encoding?: unknown,
    cb?: unknown,
  ) => boolean;
  const originalEnd = res.end.bind(res) as (
    chunk?: unknown,
    encoding?: unknown,
    cb?: unknown,
  ) => Response;
  let passthrough = false;

  const restore = () => {
    if (passthrough) {
      return;
    }
    passthrough = true;
    res.write = originalWrite;
    res.end = originalEnd;
  };

  const capture = (chunk: unknown, encoding?: BufferEncoding) => {
    if (chunk) {
      chunks.push(toBuffer(chunk, encoding));
    }
  };

  res.write = ((chunk: unknown, encoding?: unknown, cb?: unknown) => {
    if (shouldSkip(res)) {
      restore();
      for (const pending of chunks) {
        originalWrite(pending);
      }
      chunks.length = 0;
      return originalWrite(chunk, encoding, cb);
    }
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
    if (shouldSkip(res)) {
      restore();
      for (const pending of chunks) {
        originalWrite(pending);
      }
      chunks.length = 0;
      return originalEnd(chunk, encoding, cb);
    }
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
      return originalEnd(body, callback);
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
    return originalEnd(compressed, callback);
  }) as Response['end'];

  next();
}
