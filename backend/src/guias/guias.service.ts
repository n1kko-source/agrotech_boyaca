import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Paginated } from '../shared/pagination/cursor';
import { decodeCursor, paginate } from '../shared/pagination/cursor';
import { AUDIO_COMPRESSOR } from './audio.compressor';
import type { AudioCompressor } from './audio.compressor';
import {
  contentRangeHeader,
  parseRangeHeader,
  unsatisfiableContentRange,
  type ByteRange,
} from './byte-range';
import {
  GUIAS_AUDIO_MAX_BYTES,
  GUIAS_OBJECT_PREFIX,
  GUIAS_PDF_MAX_BYTES,
  normalizeGuiaLabel,
  type GuiaKind,
} from './guias.constants';
import { GUIAS_STORE } from './guias.store';
import type { GuiaRecord, GuiasStore } from './guias.store';
import { OBJECT_STORE } from './object.store';
import type { ObjectStore } from './object.store';
import { R2UsageMeter } from './r2-usage.meter';

export type GuiaView = {
  id: string;
  titulo: string;
  categoria: string;
  subsector: string;
  kind: GuiaKind;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export type UploadedGuiaFile = {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
};

export type ArchivoStream = {
  status: 200 | 206 | 416;
  mimeType: string;
  sizeBytes: number;
  contentLength: number;
  contentRange?: string;
  body: Buffer | Readable;
};

@Injectable()
export class GuiasService implements OnModuleInit {
  constructor(
    @Inject(GUIAS_STORE) private readonly store: GuiasStore,
    @Inject(OBJECT_STORE) private readonly objects: ObjectStore,
    @Inject(AUDIO_COMPRESSOR) private readonly audio: AudioCompressor,
    private readonly meter: R2UsageMeter,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    await this.meter.hydrate();
  }

  async create(
    createdBy: string,
    meta: { titulo: string; categoria: string; subsector: string },
    file: UploadedGuiaFile | undefined,
  ): Promise<GuiaView> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('archivo is required');
    }
    const kind = detectKind(file);
    assertSize(kind, file.size);

    let body = file.buffer;
    let mimeType =
      kind === 'pdf' ? 'application/pdf' : file.mimetype || 'audio/mpeg';
    let extension =
      kind === 'pdf' ? 'pdf' : extensionOf(file.originalname, 'bin');

    if (kind === 'audio') {
      const compressed = await this.audio.compress(file.buffer);
      body = compressed.buffer;
      mimeType = compressed.mimeType;
      extension = compressed.extension;
    }

    if (this.meter.wouldExceedStorage(body.length)) {
      throw new BadRequestException('R2 storage quota exceeded');
    }
    if (!this.objects.configured) {
      throw new ServiceUnavailableException('R2 unavailable');
    }

    const id = randomUUID();
    const objectKey = `${GUIAS_OBJECT_PREFIX}${id}.${extension}`;

    await this.objects.put({ key: objectKey, body, contentType: mimeType });

    try {
      const row = await this.store.create({
        titulo: meta.titulo.trim(),
        categoria: normalizeGuiaLabel(meta.categoria),
        subsector: normalizeGuiaLabel(meta.subsector),
        kind,
        mimeType,
        sizeBytes: body.length,
        objectKey,
        createdBy,
      });
      this.meter.addStorage(body.length);
      return toView(row);
    } catch (err) {
      await this.objects.delete(objectKey).catch(() => undefined);
      throw err;
    }
  }

  async list(
    limit: number,
    cursor?: string,
    categoria?: string,
  ): Promise<Paginated<GuiaView>> {
    const decoded = cursor ? decodeCursor(cursor) : undefined;
    const filter = categoria ? normalizeGuiaLabel(categoria) : undefined;
    const rows = await this.store.list(limit, decoded, filter);
    const page = paginate(rows, limit);
    return {
      items: page.items.map(toView),
      nextCursor: page.nextCursor,
    };
  }

  async get(id: string): Promise<GuiaView> {
    const row = await this.require(id);
    return toView(row);
  }

  async update(
    id: string,
    patch: { titulo?: string; categoria?: string; subsector?: string },
  ): Promise<GuiaView> {
    if (
      patch.titulo === undefined &&
      patch.categoria === undefined &&
      patch.subsector === undefined
    ) {
      throw new BadRequestException('No fields to update');
    }
    const updated = await this.store.update(id, {
      titulo: patch.titulo?.trim(),
      categoria:
        patch.categoria !== undefined
          ? normalizeGuiaLabel(patch.categoria)
          : undefined,
      subsector:
        patch.subsector !== undefined
          ? normalizeGuiaLabel(patch.subsector)
          : undefined,
    });
    if (!updated) {
      throw new NotFoundException('Not found');
    }
    return toView(updated);
  }

  async remove(id: string): Promise<void> {
    const row = await this.require(id);
    await this.objects.delete(row.objectKey);
    const deleted = await this.store.delete(id);
    if (!deleted) {
      throw new NotFoundException('Not found');
    }
    this.meter.removeStorage(row.sizeBytes);
  }

  async openArchivo(id: string, rangeHeader?: string): Promise<ArchivoStream> {
    const row = await this.require(id);
    const parsed = parseRangeHeader(rangeHeader, row.sizeBytes);
    if (parsed.type === 'unsatisfiable') {
      return {
        status: 416,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        contentLength: 0,
        contentRange: unsatisfiableContentRange(row.sizeBytes),
        body: Buffer.alloc(0),
      };
    }
    const range: ByteRange | undefined =
      parsed.type === 'partial' ? parsed.range : undefined;
    const stored = await this.objects.get(row.objectKey, range);
    if (!stored) {
      throw new ServiceUnavailableException('R2 unavailable');
    }
    this.meter.recordRead();
    if (parsed.type === 'partial' && range) {
      return {
        status: 206,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        contentLength: stored.contentLength,
        contentRange: contentRangeHeader(range, row.sizeBytes),
        body: stored.body,
      };
    }
    return {
      status: 200,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      contentLength: stored.contentLength,
      body: stored.body,
    };
  }

  private async require(id: string): Promise<GuiaRecord> {
    const row = await this.store.findById(id);
    if (!row) {
      throw new NotFoundException('Not found');
    }
    return row;
  }
}

function toView(row: GuiaRecord): GuiaView {
  return {
    id: row.id,
    titulo: row.titulo,
    categoria: row.categoria,
    subsector: row.subsector,
    kind: row.kind,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
  };
}

function detectKind(file: UploadedGuiaFile): GuiaKind {
  const mime = (file.mimetype ?? '').toLowerCase();
  const name = (file.originalname ?? '').toLowerCase();
  if (mime === 'application/pdf' || name.endsWith('.pdf')) {
    return 'pdf';
  }
  if (
    mime.startsWith('audio/') ||
    /\.(mp3|wav|ogg|opus|m4a|aac|webm)$/.test(name)
  ) {
    return 'audio';
  }
  throw new BadRequestException('Unsupported file type');
}

function assertSize(kind: GuiaKind, size: number): void {
  const max = kind === 'pdf' ? GUIAS_PDF_MAX_BYTES : GUIAS_AUDIO_MAX_BYTES;
  if (size > max) {
    throw new PayloadTooLargeException('File too large');
  }
}

function extensionOf(name: string, fallback: string): string {
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) {
    return fallback;
  }
  return name.slice(dot + 1).toLowerCase();
}

export function isReadable(body: Buffer | Readable): body is Readable {
  return body instanceof Readable;
}
