import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { COMMODITY_MONEDA } from './commodity.constants';

export type PriceRecord = {
  id: string;
  producto: string;
  region: string;
  precio: number;
  unidad: string;
  moneda: string;
  reportedBy: string;
  updatedAt: Date;
};

export type UpsertPriceInput = {
  id?: string;
  producto: string;
  region: string;
  precio: number;
  unidad: string;
  reportedBy: string;
};

export const PRICES_STORE = Symbol('PRICES_STORE');

export interface PricesStore {
  upsert(input: UpsertPriceInput): Promise<PriceRecord>;
  find(producto: string, region: string): Promise<PriceRecord | null>;
}

@Injectable()
export class PrismaPricesStore implements PricesStore {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(input: UpsertPriceInput): Promise<PriceRecord> {
    const row = await this.prisma.db.commodityPrice.upsert({
      where: {
        producto_region: {
          producto: input.producto,
          region: input.region,
        },
      },
      create: {
        id: input.id ?? randomUUID(),
        producto: input.producto,
        region: input.region,
        precio: new Prisma.Decimal(input.precio),
        unidad: input.unidad,
        moneda: COMMODITY_MONEDA,
        reportedBy: input.reportedBy,
      },
      update: {
        precio: new Prisma.Decimal(input.precio),
        unidad: input.unidad,
        reportedBy: input.reportedBy,
      },
    });
    return toPriceRecord(row);
  }

  async find(producto: string, region: string): Promise<PriceRecord | null> {
    const row = await this.prisma.db.commodityPrice.findUnique({
      where: { producto_region: { producto, region } },
    });
    return row ? toPriceRecord(row) : null;
  }
}

@Injectable()
export class MemoryPricesStore implements PricesStore {
  readonly rows = new Map<string, PriceRecord>();

  upsert(input: UpsertPriceInput): Promise<PriceRecord> {
    const key = memoryKey(input.producto, input.region);
    const existing = this.rows.get(key);
    const row: PriceRecord = {
      id: existing?.id ?? input.id ?? randomUUID(),
      producto: input.producto,
      region: input.region,
      precio: input.precio,
      unidad: input.unidad,
      moneda: COMMODITY_MONEDA,
      reportedBy: input.reportedBy,
      updatedAt: new Date(),
    };
    this.rows.set(key, row);
    return Promise.resolve(row);
  }

  find(producto: string, region: string): Promise<PriceRecord | null> {
    return Promise.resolve(this.rows.get(memoryKey(producto, region)) ?? null);
  }
}

function memoryKey(producto: string, region: string): string {
  return `${producto}\0${region}`;
}

function toPriceRecord(row: {
  id: string;
  producto: string;
  region: string;
  precio: Prisma.Decimal | number | string;
  unidad: string;
  moneda: string;
  reportedBy: string;
  updatedAt: Date;
}): PriceRecord {
  return {
    id: row.id,
    producto: row.producto,
    region: row.region,
    precio: Number(row.precio),
    unidad: row.unidad,
    moneda: row.moneda,
    reportedBy: row.reportedBy,
    updatedAt: row.updatedAt,
  };
}
