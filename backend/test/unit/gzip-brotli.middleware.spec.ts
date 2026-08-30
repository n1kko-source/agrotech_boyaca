import {
  gzipBrotliMiddleware,
  skipCompression,
} from '../../src/shared/compress/gzip-brotli.middleware';
import type { NextFunction, Request, Response } from 'express';

function fakeRes(): Response & {
  chunks: Buffer[];
  headers: Record<string, string>;
} {
  const headers: Record<string, string> = {};
  const chunks: Buffer[] = [];
  const res = {
    chunks,
    headers,
    locals: {},
    statusCode: 200,
    headersSent: false,
    getHeader(name: string) {
      return headers[name.toLowerCase()];
    },
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
    write(chunk: unknown) {
      chunks.push(Buffer.from(chunk as Buffer));
      return true;
    },
    end(chunk?: unknown) {
      if (chunk) {
        chunks.push(Buffer.from(chunk as Buffer));
      }
    },
  };
  return res as unknown as Response & {
    chunks: Buffer[];
    headers: Record<string, string>;
  };
}

describe('gzipBrotliMiddleware', () => {
  it('does not buffer when skipCompression is set', () => {
    const req = {
      headers: { 'accept-encoding': 'gzip' },
    } as unknown as Request;
    const res = fakeRes();
    gzipBrotliMiddleware(req, res, (() => undefined) as NextFunction);
    skipCompression(res);
    res.setHeader('Content-Type', 'application/pdf');
    const payload = Buffer.from('A'.repeat(2000));
    res.end(payload);
    expect(res.chunks.join('')).toBe(payload.toString());
    expect(res.headers['content-encoding']).toBeUndefined();
  });
});
