import { createHash, createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ByteRange } from './byte-range';
import type { ObjectPutInput, ObjectStore, StoredObject } from './object.store';

const R2_TIMEOUT_MS = 30_000;

@Injectable()
export class R2ObjectStore implements ObjectStore {
  readonly configured = true;
  private readonly bucket: string;
  private readonly endpoint: string;
  private readonly accessKey: string;
  private readonly secretKey: string;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('R2_BUCKET') ?? '';
    this.endpoint = (config.get<string>('R2_ENDPOINT') ?? '').replace(
      /\/$/,
      '',
    );
    this.accessKey = config.get<string>('R2_ACCESS_KEY_ID') ?? '';
    this.secretKey = config.get<string>('R2_SECRET_ACCESS_KEY') ?? '';
  }

  async put(input: ObjectPutInput): Promise<void> {
    const res = await this.signed('PUT', input.key, {
      body: input.body,
      contentType: input.contentType,
    });
    if (!res.ok) {
      throw new ServiceUnavailableException('R2 unavailable');
    }
  }

  async get(key: string, range?: ByteRange): Promise<StoredObject | null> {
    const headers: Record<string, string> = {};
    if (range) {
      headers['range'] = `bytes=${range.start}-${range.end}`;
    }
    const res = await this.signed('GET', key, { extraHeaders: headers });
    if (res.status === 404) {
      return null;
    }
    if (!res.ok && res.status !== 206) {
      throw new ServiceUnavailableException('R2 unavailable');
    }
    const contentType =
      res.headers.get('content-type') ?? 'application/octet-stream';
    const contentLength = Number(res.headers.get('content-length') ?? 0);
    if (!res.body) {
      return { body: Buffer.alloc(0), contentType, contentLength: 0 };
    }
    return {
      body: Readable.fromWeb(res.body as never),
      contentType,
      contentLength,
    };
  }

  async delete(key: string): Promise<void> {
    const res = await this.signed('DELETE', key);
    if (!res.ok && res.status !== 404) {
      throw new ServiceUnavailableException('R2 unavailable');
    }
  }

  private async signed(
    method: 'GET' | 'PUT' | 'DELETE',
    key: string,
    opts?: {
      body?: Buffer;
      contentType?: string;
      extraHeaders?: Record<string, string>;
    },
  ): Promise<Response> {
    const url = `${this.endpoint}/${this.bucket}/${encodeKey(key)}`;
    const now = new Date();
    const amzDate = toAmzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = opts?.body ? sha256Hex(opts.body) : EMPTY_SHA256;
    const headers: Record<string, string> = {
      host: hostOf(this.endpoint),
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      ...(opts?.contentType ? { 'content-type': opts.contentType } : {}),
      ...(opts?.extraHeaders ?? {}),
    };
    if (opts?.body) {
      headers['content-length'] = String(opts.body.length);
    }
    headers.authorization = this.authorization(
      method,
      `/${this.bucket}/${encodeKey(key)}`,
      headers,
      payloadHash,
      dateStamp,
      amzDate,
    );
    try {
      return await fetch(url, {
        method,
        headers,
        body: opts?.body ? new Uint8Array(opts.body) : undefined,
        signal: AbortSignal.timeout(R2_TIMEOUT_MS),
      });
    } catch {
      throw new ServiceUnavailableException('R2 unavailable');
    }
  }

  private authorization(
    method: string,
    canonicalUri: string,
    headers: Record<string, string>,
    payloadHash: string,
    dateStamp: string,
    amzDate: string,
  ): string {
    const signedHeaderNames = Object.keys(headers)
      .map((name) => name.toLowerCase())
      .sort();
    const canonicalHeaders = signedHeaderNames
      .map((name) => `${name}:${(headers[name] ?? '').trim()}\n`)
      .join('');
    const signedHeaders = signedHeaderNames.join(';');
    const canonical = [
      method,
      canonicalUri,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');
    const scope = `${dateStamp}/auto/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      sha256Hex(canonical),
    ].join('\n');
    const signature = hmacHex(
      signingKey(this.secretKey, dateStamp),
      stringToSign,
    );
    return `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  }
}

const EMPTY_SHA256 =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

function encodeKey(key: string): string {
  return key
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function hostOf(endpoint: string): string {
  return new URL(endpoint).host;
}

function toAmzDate(now: Date): string {
  return now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key: Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function hmacHex(key: Buffer, data: string): string {
  return createHmac('sha256', key).update(data, 'utf8').digest('hex');
}

function signingKey(secret: string, dateStamp: string): Buffer {
  const kDate = hmac(Buffer.from(`AWS4${secret}`, 'utf8'), dateStamp);
  const kRegion = hmac(kDate, 'auto');
  const kService = hmac(kRegion, 's3');
  return hmac(kService, 'aws4_request');
}
