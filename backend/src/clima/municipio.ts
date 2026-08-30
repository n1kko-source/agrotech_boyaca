import {
  CLIMA_CACHE_KEY_PREFIX,
  MUNICIPIO_MAX,
  MUNICIPIO_MIN,
} from './clima.constants';

const MUNICIPIO_RE = /^[\p{L}\p{M}0-9 .'-]+$/u;

export function normalizeMunicipio(raw: string): string | null {
  const value = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (value.length < MUNICIPIO_MIN || value.length > MUNICIPIO_MAX) {
    return null;
  }
  if (!MUNICIPIO_RE.test(value)) {
    return null;
  }
  return value;
}

export function climaCacheKey(municipio: string): string {
  return `${CLIMA_CACHE_KEY_PREFIX}${municipio.replace(/\s/g, '_')}`;
}
