import { Readable } from 'node:stream';
import { ServiceUnavailableException } from '@nestjs/common';
import type { ByteRange } from './byte-range';

export const OBJECT_STORE = Symbol('OBJECT_STORE');

export type StoredObject = {
  body: Buffer | Readable;
  contentType: string;
  contentLength: number;
};

export type ObjectPutInput = {
  key: string;
  body: Buffer;
  contentType: string;
};

export interface ObjectStore {
  readonly configured: boolean;
  put(input: ObjectPutInput): Promise<void>;
  get(key: string, range?: ByteRange): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}

export class UnavailableObjectStore implements ObjectStore {
  readonly configured = false;

  put(): Promise<void> {
    return Promise.reject(new ServiceUnavailableException('R2 unavailable'));
  }

  get(): Promise<StoredObject | null> {
    return Promise.reject(new ServiceUnavailableException('R2 unavailable'));
  }

  delete(): Promise<void> {
    return Promise.resolve();
  }
}

export class MemoryObjectStore implements ObjectStore {
  readonly configured = true;
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();

  put(input: ObjectPutInput): Promise<void> {
    this.objects.set(input.key, {
      body: Buffer.from(input.body),
      contentType: input.contentType,
    });
    return Promise.resolve();
  }

  get(key: string, range?: ByteRange): Promise<StoredObject | null> {
    const stored = this.objects.get(key);
    if (!stored) {
      return Promise.resolve(null);
    }
    const body = range
      ? stored.body.subarray(range.start, range.end + 1)
      : stored.body;
    return Promise.resolve({
      body,
      contentType: stored.contentType,
      contentLength: body.length,
    });
  }

  delete(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }
}
