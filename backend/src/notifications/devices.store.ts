import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type DeviceTokenRecord = {
  id: string;
  userId: string;
  token: string;
  deviceId: string;
};

export const DEVICE_TOKENS = Symbol('DEVICE_TOKENS');

export interface DeviceTokenStore {
  upsert(
    userId: string,
    deviceId: string,
    token: string,
  ): Promise<DeviceTokenRecord>;
  listByUser(userId: string): Promise<DeviceTokenRecord[]>;
  removeByToken(token: string): Promise<void>;
  removeByDevice(userId: string, deviceId: string): Promise<void>;
}

@Injectable()
export class PrismaDeviceTokenStore implements DeviceTokenStore {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(
    userId: string,
    deviceId: string,
    token: string,
  ): Promise<DeviceTokenRecord> {
    await this.prisma.db.deviceToken.deleteMany({ where: { token } });
    const row = await this.prisma.db.deviceToken.upsert({
      where: { userId_deviceId: { userId, deviceId } },
      create: { id: randomUUID(), userId, deviceId, token },
      update: { token },
    });
    return toRecord(row);
  }

  async listByUser(userId: string): Promise<DeviceTokenRecord[]> {
    const rows = await this.prisma.db.deviceToken.findMany({
      where: { userId },
    });
    return rows.map(toRecord);
  }

  async removeByToken(token: string): Promise<void> {
    await this.prisma.db.deviceToken.deleteMany({ where: { token } });
  }

  async removeByDevice(userId: string, deviceId: string): Promise<void> {
    await this.prisma.db.deviceToken.deleteMany({
      where: { userId, deviceId },
    });
  }
}

@Injectable()
export class MemoryDeviceTokenStore implements DeviceTokenStore {
  readonly rows = new Map<string, DeviceTokenRecord>();

  upsert(
    userId: string,
    deviceId: string,
    token: string,
  ): Promise<DeviceTokenRecord> {
    for (const [key, row] of this.rows) {
      if (
        row.token === token &&
        (row.userId !== userId || row.deviceId !== deviceId)
      ) {
        this.rows.delete(key);
      }
    }
    const key = memoryKey(userId, deviceId);
    const existing = this.rows.get(key);
    const row: DeviceTokenRecord = {
      id: existing?.id ?? randomUUID(),
      userId,
      deviceId,
      token,
    };
    this.rows.set(key, row);
    return Promise.resolve(row);
  }

  listByUser(userId: string): Promise<DeviceTokenRecord[]> {
    return Promise.resolve(
      [...this.rows.values()].filter((row) => row.userId === userId),
    );
  }

  removeByToken(token: string): Promise<void> {
    for (const [key, row] of this.rows) {
      if (row.token === token) {
        this.rows.delete(key);
      }
    }
    return Promise.resolve();
  }

  removeByDevice(userId: string, deviceId: string): Promise<void> {
    this.rows.delete(memoryKey(userId, deviceId));
    return Promise.resolve();
  }
}

function memoryKey(userId: string, deviceId: string): string {
  return `${userId}\0${deviceId}`;
}

function toRecord(row: {
  id: string;
  userId: string;
  token: string;
  deviceId: string;
}): DeviceTokenRecord {
  return {
    id: row.id,
    userId: row.userId,
    token: row.token,
    deviceId: row.deviceId,
  };
}
