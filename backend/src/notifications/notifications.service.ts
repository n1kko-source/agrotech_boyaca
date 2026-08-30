import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { DEVICE_TOKENS } from './devices.store';
import type { DeviceTokenStore } from './devices.store';
import { FCM_CLIENT } from './fcm/fcm.client';
import type { FcmClient } from './fcm/fcm.client';
import { INBOX } from './inbox.store';
import type { InboxRecord, InboxStore } from './inbox.store';
import {
  NOTIFICATION_BODY_MAX,
  NOTIFICATION_DATA_MAX_KEYS,
  NOTIFICATION_DATA_VALUE_MAX,
  NOTIFICATION_TITLE_MAX,
  PENDING_LIMIT_DEFAULT,
} from './notification.constants';

export type NotificationPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

export type SendResult = {
  id: string;
  status: 'pending' | 'sent';
};

export type PendingItem = {
  id: string;
  title: string;
  body: string;
  data: Record<string, string>;
  createdAt: string;
};

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @Inject(DEVICE_TOKENS) private readonly devices: DeviceTokenStore,
    @Inject(INBOX) private readonly inbox: InboxStore,
    @Inject(FCM_CLIENT) private readonly fcm: FcmClient,
  ) {}

  /**
   * Persist + attempt FCM. Reusable by Comunidad, Commodities, and later
   * Noticias. Never throws on FCM/provider failure — the row stays PENDING.
   */
  async send(
    userId: string,
    payload: NotificationPayload,
  ): Promise<SendResult> {
    const title = requireText(payload.title, NOTIFICATION_TITLE_MAX, 'title');
    const body = requireText(payload.body, NOTIFICATION_BODY_MAX, 'body');
    const data = normalizeData(payload.data);
    const row = await this.inbox.enqueue({ userId, title, body, data });
    const sent = await this.dispatch(row);
    return { id: row.id, status: sent ? 'sent' : 'pending' };
  }

  async registerDevice(
    userId: string,
    input: { token: string; deviceId: string },
  ): Promise<{ registered: true }> {
    await this.devices.upsert(userId, input.deviceId, input.token);
    await this.flushPending(userId);
    return { registered: true };
  }

  async unregisterDevice(
    userId: string,
    deviceId: string,
  ): Promise<{ revoked: true }> {
    await this.devices.removeByDevice(userId, deviceId);
    return { revoked: true };
  }

  /** Login / reconnect: optional new token, then retry FCM for the inbox. */
  async onLogin(
    userId: string,
    device?: { token: string; deviceId: string } | null,
  ): Promise<void> {
    if (device) {
      await this.registerDevice(userId, device);
      return;
    }
    await this.flushPending(userId);
  }

  async pending(
    userId: string,
    limit = PENDING_LIMIT_DEFAULT,
  ): Promise<{
    items: PendingItem[];
  }> {
    const rows = await this.inbox.listUnacked(userId, limit);
    return { items: rows.map(toItem) };
  }

  async ack(userId: string, ids: string[]): Promise<{ acked: number }> {
    const acked = await this.inbox.markDelivered(userId, ids);
    return { acked };
  }

  private async flushPending(userId: string): Promise<void> {
    const rows = await this.inbox.listPending(userId, PENDING_LIMIT_DEFAULT);
    for (const row of rows) {
      await this.dispatch(row);
    }
  }

  private async dispatch(row: InboxRecord): Promise<boolean> {
    const tokens = await this.devices.listByUser(row.userId);
    if (tokens.length === 0) {
      return false;
    }
    const data = { notificationId: row.id, ...row.data };
    const results = await Promise.all(
      tokens.map(async (device) => {
        const result = await this.fcm.send({
          token: device.token,
          title: row.title,
          body: row.body,
          data,
        });
        if (result === 'unregistered') {
          await this.devices.removeByToken(device.token);
          this.logger.log(`Removed stale FCM token device=${device.deviceId}`);
        }
        return result;
      }),
    );
    const accepted = results.some((result) => result === 'ok');
    if (accepted) {
      await this.inbox.markSent([row.id]);
    }
    return accepted;
  }
}

function requireText(raw: string, max: number, field: string): string {
  const value = raw?.trim() ?? '';
  if (!value || value.length > max) {
    throw new BadRequestException(`Invalid ${field}`);
  }
  return value;
}

function normalizeData(
  raw: Record<string, string> | undefined,
): Record<string, string> {
  if (!raw) {
    return {};
  }
  const keys = Object.keys(raw);
  if (keys.length > NOTIFICATION_DATA_MAX_KEYS) {
    throw new BadRequestException('Invalid notification data');
  }
  const data: Record<string, string> = {};
  for (const key of keys) {
    const value = raw[key];
    if (
      typeof value !== 'string' ||
      value.length > NOTIFICATION_DATA_VALUE_MAX
    ) {
      throw new BadRequestException('Invalid notification data');
    }
    data[key] = value;
  }
  return data;
}

function toItem(row: InboxRecord): PendingItem {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    data: row.data,
    createdAt: row.createdAt.toISOString(),
  };
}
