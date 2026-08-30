export const GUIAS_OBJECT_PREFIX = 'guias/';

/** Cloudflare R2 Free: 10 GB storage (whole bucket, including backups). */
export const R2_STORAGE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024;

/** Cloudflare R2 Free: 1 M Class B operations / month. */
export const R2_READS_MONTHLY_LIMIT = 1_000_000;

export const GUIAS_PDF_MAX_BYTES = 8 * 1024 * 1024;
export const GUIAS_AUDIO_MAX_BYTES = 30 * 1024 * 1024;

export const GUIAS_TITLE_MIN = 1;
export const GUIAS_TITLE_MAX = 120;
export const GUIAS_CATEGORIA_MIN = 1;
export const GUIAS_CATEGORIA_MAX = 60;
export const GUIAS_SUBSECTOR_MIN = 1;
export const GUIAS_SUBSECTOR_MAX = 60;

export const GUIAS_KINDS = ['pdf', 'audio'] as const;
export type GuiaKind = (typeof GUIAS_KINDS)[number];

export const AUDIO_OPUS_BITRATE = '16k';
export const AUDIO_OPUS_SAMPLE_RATE = 16_000;
export const AUDIO_OPUS_MIME = 'audio/ogg';
export const AUDIO_OPUS_EXT = 'ogg';

export function utcMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export function normalizeGuiaLabel(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}
