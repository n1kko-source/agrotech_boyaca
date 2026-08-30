import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AlertKind } from './clima.constants';

export type WeatherAlertRecord = {
  id: string;
  userId: string;
  municipio: string;
  kind: AlertKind;
  enabled: boolean;
  lastFiredAt: Date | null;
  createdAt: Date;
};

export type UpsertAlertInput = {
  userId: string;
  municipio: string;
  kind: AlertKind;
  enabled: boolean;
};

export const WEATHER_ALERTS = Symbol('WEATHER_ALERTS');

export interface WeatherAlertStore {
  upsert(input: UpsertAlertInput): Promise<WeatherAlertRecord>;
  listByUser(userId: string): Promise<WeatherAlertRecord[]>;
  listEnabled(): Promise<WeatherAlertRecord[]>;
  markFired(id: string, at: Date): Promise<void>;
}

@Injectable()
export class PrismaWeatherAlertStore implements WeatherAlertStore {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(input: UpsertAlertInput): Promise<WeatherAlertRecord> {
    const row = await this.prisma.db.weatherAlert.upsert({
      where: {
        userId_municipio_kind: {
          userId: input.userId,
          municipio: input.municipio,
          kind: input.kind,
        },
      },
      create: {
        id: randomUUID(),
        userId: input.userId,
        municipio: input.municipio,
        kind: input.kind,
        enabled: input.enabled,
      },
      update: { enabled: input.enabled },
    });
    return toRecord(row);
  }

  async listByUser(userId: string): Promise<WeatherAlertRecord[]> {
    const rows = await this.prisma.db.weatherAlert.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toRecord);
  }

  async listEnabled(): Promise<WeatherAlertRecord[]> {
    const rows = await this.prisma.db.weatherAlert.findMany({
      where: { enabled: true },
    });
    return rows.map(toRecord);
  }

  async markFired(id: string, at: Date): Promise<void> {
    await this.prisma.db.weatherAlert.update({
      where: { id },
      data: { lastFiredAt: at },
    });
  }
}

@Injectable()
export class MemoryWeatherAlertStore implements WeatherAlertStore {
  readonly rows: WeatherAlertRecord[] = [];

  upsert(input: UpsertAlertInput): Promise<WeatherAlertRecord> {
    const existing = this.rows.find(
      (row) =>
        row.userId === input.userId &&
        row.municipio === input.municipio &&
        row.kind === input.kind,
    );
    if (existing) {
      existing.enabled = input.enabled;
      return Promise.resolve(existing);
    }
    const row: WeatherAlertRecord = {
      id: randomUUID(),
      userId: input.userId,
      municipio: input.municipio,
      kind: input.kind,
      enabled: input.enabled,
      lastFiredAt: null,
      createdAt: new Date(),
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  listByUser(userId: string): Promise<WeatherAlertRecord[]> {
    return Promise.resolve(
      this.rows
        .filter((row) => row.userId === userId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    );
  }

  listEnabled(): Promise<WeatherAlertRecord[]> {
    return Promise.resolve(this.rows.filter((row) => row.enabled));
  }

  markFired(id: string, at: Date): Promise<void> {
    const row = this.rows.find((item) => item.id === id);
    if (row) {
      row.lastFiredAt = at;
    }
    return Promise.resolve();
  }
}

function toRecord(row: {
  id: string;
  userId: string;
  municipio: string;
  kind: string;
  enabled: boolean;
  lastFiredAt: Date | null;
  createdAt: Date;
}): WeatherAlertRecord {
  return {
    id: row.id,
    userId: row.userId,
    municipio: row.municipio,
    kind: row.kind as AlertKind,
    enabled: row.enabled,
    lastFiredAt: row.lastFiredAt,
    createdAt: row.createdAt,
  };
}
