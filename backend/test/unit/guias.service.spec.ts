import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { AudioCompressor } from '../../src/guias/audio.compressor';
import {
  AUDIO_OPUS_EXT,
  AUDIO_OPUS_MIME,
} from '../../src/guias/guias.constants';
import { GuiasService } from '../../src/guias/guias.service';
import { MemoryGuiasStore } from '../../src/guias/guias.store';
import { MemoryObjectStore } from '../../src/guias/object.store';
import { R2UsageMeter } from '../../src/guias/r2-usage.meter';

const ADMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const pdfFile = {
  buffer: Buffer.from('%PDF-1.4\n' + 'x'.repeat(80)),
  mimetype: 'application/pdf',
  size: 90,
  originalname: 'siembra.pdf',
};

function compressor(): AudioCompressor & { compress: jest.Mock } {
  const compress = jest.fn().mockResolvedValue({
    buffer: Buffer.from('OggS-opus'),
    mimeType: AUDIO_OPUS_MIME,
    extension: AUDIO_OPUS_EXT,
  });
  return { compress };
}

describe('GuiasService', () => {
  function setup() {
    const store = new MemoryGuiasStore();
    const objects = new MemoryObjectStore();
    const audio = compressor();
    const meter = new R2UsageMeter(store);
    const service = new GuiasService(store, objects, audio, meter);
    return { store, objects, audio, meter, service };
  }

  it('stores PDF metadata and bytes, lists by categoria, and honors Range', async () => {
    const { service, objects, meter } = setup();
    const created = await service.create(
      ADMIN,
      { titulo: 'Siembra de papa', categoria: 'Papa', subsector: 'Tubérculos' },
      pdfFile,
    );
    expect(created.kind).toBe('pdf');
    expect(created.categoria).toBe('papa');
    expect(created.subsector).toBe('tubérculos');
    expect(created.sizeBytes).toBe(pdfFile.buffer.length);
    expect(objects.objects.size).toBe(1);
    expect(meter.snapshot().storageBytes).toBe(pdfFile.buffer.length);

    const page = await service.list(20, undefined, 'PAPA');
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeNull();

    const other = await service.list(20, undefined, 'maiz');
    expect(other.items).toHaveLength(0);

    const full = await service.openArchivo(created.id);
    expect(full.status).toBe(200);
    expect(Buffer.isBuffer(full.body) && full.body.equals(pdfFile.buffer)).toBe(
      true,
    );

    const partial = await service.openArchivo(created.id, 'bytes=0-4');
    expect(partial.status).toBe(206);
    expect(partial.contentRange).toBe(`bytes 0-4/${pdfFile.buffer.length}`);
    expect(Buffer.isBuffer(partial.body) && partial.body.toString()).toBe(
      '%PDF-',
    );
    expect(meter.snapshot().reads).toBe(2);

    const unsat = await service.openArchivo(created.id, 'bytes=9999-10000');
    expect(unsat.status).toBe(416);
  });

  it('compresses audio before put', async () => {
    const { service, objects, audio } = setup();
    const wav = {
      buffer: Buffer.from('RIFF....WAVEfmt'),
      mimetype: 'audio/wav',
      size: 16,
      originalname: 'guia.wav',
    };
    const created = await service.create(
      ADMIN,
      { titulo: 'Riego', categoria: 'agua', subsector: 'hortalizas' },
      wav,
    );
    expect(audio.compress.mock.calls).toHaveLength(1);
    expect(created.kind).toBe('audio');
    expect(created.mimeType).toBe(AUDIO_OPUS_MIME);
    expect(created.sizeBytes).toBe(9);
    const stored = [...objects.objects.values()][0];
    expect(stored?.contentType).toBe(AUDIO_OPUS_MIME);
    expect(stored?.body.toString()).toBe('OggS-opus');
  });

  it('rejects missing file and unknown types', async () => {
    const { service } = setup();
    await expect(
      service.create(
        ADMIN,
        { titulo: 'x', categoria: 'y', subsector: 'z' },
        undefined,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(
        ADMIN,
        { titulo: 'x', categoria: 'y', subsector: 'z' },
        {
          buffer: Buffer.from('nope'),
          mimetype: 'image/png',
          size: 4,
          originalname: 'x.png',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates metadata and deletes object + row', async () => {
    const { service, objects, meter } = setup();
    const created = await service.create(
      ADMIN,
      { titulo: 'A', categoria: 'papa', subsector: 'tuberculos' },
      pdfFile,
    );
    const patched = await service.update(created.id, { titulo: 'B' });
    expect(patched.titulo).toBe('B');
    await service.remove(created.id);
    expect(objects.objects.size).toBe(0);
    expect(meter.snapshot().storageBytes).toBe(0);
    await expect(service.get(created.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
