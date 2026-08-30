import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { pemFromEnv } from '../../shared/config/pem';
import { FCM_TTL_SECONDS } from '../notification.constants';
import type { FcmClient, FcmMessage, FcmSendResult } from './fcm.client';
import { fetchGoogleAccessToken, type ServiceAccount } from './google-oauth';

type CachedToken = {
  accessToken: string;
  expiresAtMs: number;
};

@Injectable()
export class HttpFcmClient implements FcmClient {
  private readonly logger = new Logger(HttpFcmClient.name);
  private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis);
  private cached: CachedToken | null = null;

  constructor(private readonly config: ConfigService) {}

  async send(message: FcmMessage): Promise<FcmSendResult> {
    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID')?.trim();
    const account = this.serviceAccount();
    if (!projectId || !account) {
      return 'unavailable';
    }
    try {
      const accessToken = await this.accessToken(account);
      const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`;
      const res = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: message.token,
            notification: { title: message.title, body: message.body },
            data: message.data,
            android: {
              priority: 'HIGH',
              ttl: `${FCM_TTL_SECONDS}s`,
            },
          },
        }),
      });
      if (res.ok) {
        return 'ok';
      }
      const json = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      return mapFcmError(res.status, json);
    } catch (err) {
      this.logger.warn(`FCM send failed: ${errorName(err)}`);
      return 'unavailable';
    }
  }

  private serviceAccount(): ServiceAccount | null {
    const clientEmail = this.config
      .get<string>('FIREBASE_CLIENT_EMAIL')
      ?.trim();
    const privateKey = pemFromEnv(
      this.config.get<string>('FIREBASE_PRIVATE_KEY'),
    );
    if (!clientEmail || !privateKey) {
      return null;
    }
    return { clientEmail, privateKey };
  }

  private async accessToken(account: ServiceAccount): Promise<string> {
    const skewMs = 60_000;
    if (this.cached && this.cached.expiresAtMs - skewMs > Date.now()) {
      return this.cached.accessToken;
    }
    const next = await fetchGoogleAccessToken(account, this.fetchImpl);
    this.cached = next;
    return next.accessToken;
  }
}

function mapFcmError(
  status: number,
  json: Record<string, unknown>,
): FcmSendResult {
  const code = fcmErrorCode(json);
  if (
    code === 'UNREGISTERED' ||
    code === 'NOT_FOUND' ||
    code === 'SENDER_ID_MISMATCH' ||
    status === 404
  ) {
    return 'unregistered';
  }
  return 'unavailable';
}

function fcmErrorCode(json: Record<string, unknown>): string {
  const error = json.error;
  if (!error || typeof error !== 'object') {
    return '';
  }
  const err = error as Record<string, unknown>;
  const details = err.details;
  if (Array.isArray(details)) {
    for (const item of details) {
      if (item && typeof item === 'object') {
        const nested = item as Record<string, unknown>;
        if (typeof nested.errorCode === 'string') {
          return nested.errorCode;
        }
      }
    }
  }
  return typeof err.status === 'string' ? err.status : '';
}

function errorName(err: unknown): string {
  if (err instanceof Error) {
    return err.name;
  }
  return 'Error';
}

export function fcmCredentialsConfigured(config: {
  get(key: string): string | undefined;
}): boolean {
  const projectId = config.get('FIREBASE_PROJECT_ID')?.trim();
  const email = config.get('FIREBASE_CLIENT_EMAIL')?.trim();
  const key = pemFromEnv(config.get('FIREBASE_PRIVATE_KEY'));
  return Boolean(projectId && email && key);
}
