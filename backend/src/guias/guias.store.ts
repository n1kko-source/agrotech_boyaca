import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CursorPayload } from '../shared/pagination/cursor';
import type { GuiaKind } from './guias.constants';
import { utcMonth } from './guias.constants';

export const GUIAS_STORE = Symbol('GUIAS_STORE');

export type GuiaRecord = {
  id: string;
  titulo: string;
  categoria: string;
  subsector: string;
  kind: GuiaKind;
  mimeType: string;
  sizeBytes: number;
  objectKey: string;
  createdBy: string;
  createdAt: Date;
  t: number;
};

export type CreateGuiaRecordInput = {
  titulo: string;
  categoria: string;
  subsector: string;
  kind: GuiaKind;
  mimeType: string;
  sizeBytes: number;
  objectKey: string;
  createdBy: string;
};

export type UpdateGuiaRecordInput = {
  titulo?: string;
  categoria?: string;
  subsector?: string;
};

export interface GuiasStore {
  create(input: CreateGuiaRecordInput): Promise<GuiaRecord>;
  findById(id: string): Promise<GuiaRecord | null>;
  list(
    limit: number,
    cursor?: CursorPayload,
    categoria?: string,
  ): Promise<GuiaRecord[]>;
  update(id: string, input: UpdateGuiaRecordInput): Promise<GuiaRecord | null>;
  delete(id: string): Promise<GuiaRecord | null>;
  sumSizeBytes(): Promise<number>;
  readsForMonth(month: string): Promise<number>;
  incrementReads(month?: string): Promise<void>;
}

@Injectable()
export class PrismaGuiasStore implements GuiasStore {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateGuiaRecordInput): Promise<GuiaRecord> {
    const row = await this.prisma.db.guia.create({
      data: {
        id: randomUUID(),
        titulo: input.titulo,
        categoria: input.categoria,
        subsector: input.subsector,
        kind: input.kind,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        objectKey: input.objectKey,
        createdBy: input.createdBy,
      },
    });
    return toRecord(row);
  }

  async findById(id: string): Promise<GuiaRecord | null> {
    const row = await this.prisma.db.guia.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  }

  async list(
    limit: number,
    cursor?: CursorPayload,
    categoria?: string,
  ): Promise<GuiaRecord[]> {
    const take = limit + 1;
    const rows = await this.prisma.db.guia.findMany({
      where: {
        ...(categoria ? { categoria } : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { gt: new Date(cursor.t) } },
                {
                  AND: [
                    { createdAt: new Date(cursor.t) },
                    { id: { gt: cursor.id } },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take,
    });
    return rows.map(toRecord);
  }

  async update(
    id: string,
    input: UpdateGuiaRecordInput,
  ): Promise<GuiaRecord | null> {
    try {
      const row = await this.prisma.db.guia.update({
        where: { id },
        data: {
          ...(input.titulo !== undefined ? { titulo: input.titulo } : {}),
          ...(input.categoria !== undefined
            ? { categoria: input.categoria }
            : {}),
          ...(input.subsector !== undefined
            ? { subsector: input.subsector }
            : {}),
        },
      });
      return toRecord(row);
    } catch {
      return null;
    }
  }

  async delete(id: string): Promise<GuiaRecord | null> {
    try {
      const row = await this.prisma.db.guia.delete({ where: { id } });
      return toRecord(row);
    } catch {
      return null;
    }
  }

  async sumSizeBytes(): Promise<number> {
    const agg = await this.prisma.db.guia.aggregate({
      _sum: { sizeBytes: true },
    });
    return agg._sum.sizeBytes ?? 0;
  }

  async readsForMonth(month: string): Promise<number> {
    const row = await this.prisma.db.r2MonthlyRead.findUnique({
      where: { month },
    });
    return row?.reads ?? 0;
  }

  async incrementReads(month: string = utcMonth()): Promise<void> {
    await this.prisma.db.r2MonthlyRead.upsert({
      where: { month },
      create: { month, reads: 1 },
      update: { reads: { increment: 1 } },
    });
  }
}

@Injectable()
export class MemoryGuiasStore implements GuiasStore {
  readonly rows: GuiaRecord[] = [];
  readonly monthlyReads = new Map<string, number>();

  create(input: CreateGuiaRecordInput): Promise<GuiaRecord> {
    const createdAt = new Date();
    const row: GuiaRecord = {
      id: randomUUID(),
      titulo: input.titulo,
      categoria: input.categoria,
      subsector: input.subsector,
      kind: input.kind,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      objectKey: input.objectKey,
      createdBy: input.createdBy,
      createdAt,
      t: createdAt.getTime(),
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  findById(id: string): Promise<GuiaRecord | null> {
    return Promise.resolve(this.rows.find((row) => row.id === id) ?? null);
  }

  list(
    limit: number,
    cursor?: CursorPayload,
    categoria?: string,
  ): Promise<GuiaRecord[]> {
    const sorted = [...this.rows]
      .filter((row) => (categoria ? row.categoria === categoria : true))
      .sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
    const filtered = cursor
      ? sorted.filter(
          (row) =>
            row.t > cursor.t || (row.t === cursor.t && row.id > cursor.id),
        )
      : sorted;
    return Promise.resolve(filtered.slice(0, limit + 1));
  }

  update(id: string, input: UpdateGuiaRecordInput): Promise<GuiaRecord | null> {
    const row = this.rows.find((item) => item.id === id);
    if (!row) {
      return Promise.resolve(null);
    }
    if (input.titulo !== undefined) {
      row.titulo = input.titulo;
    }
    if (input.categoria !== undefined) {
      row.categoria = input.categoria;
    }
    if (input.subsector !== undefined) {
      row.subsector = input.subsector;
    }
    return Promise.resolve(row);
  }

  delete(id: string): Promise<GuiaRecord | null> {
    const index = this.rows.findIndex((row) => row.id === id);
    if (index < 0) {
      return Promise.resolve(null);
    }
    const [removed] = this.rows.splice(index, 1);
    return Promise.resolve(removed ?? null);
  }

  sumSizeBytes(): Promise<number> {
    return Promise.resolve(
      this.rows.reduce((sum, row) => sum + row.sizeBytes, 0),
    );
  }

  readsForMonth(month: string): Promise<number> {
    return Promise.resolve(this.monthlyReads.get(month) ?? 0);
  }

  incrementReads(month: string = utcMonth()): Promise<void> {
    this.monthlyReads.set(month, (this.monthlyReads.get(month) ?? 0) + 1);
    return Promise.resolve();
  }
}

type PrismaGuia = {
  id: string;
  titulo: string;
  categoria: string;
  subsector: string;
  kind: string;
  mimeType: string;
  sizeBytes: number;
  objectKey: string;
  createdBy: string;
  createdAt: Date;
};

function toRecord(row: PrismaGuia): GuiaRecord {
  return {
    id: row.id,
    titulo: row.titulo,
    categoria: row.categoria,
    subsector: row.subsector,
    kind: row.kind as GuiaKind,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    objectKey: row.objectKey,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    t: row.createdAt.getTime(),
  };
}
