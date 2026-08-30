import { COMMODITY_CACHE_KEY_PREFIX } from './commodity.constants';

export function normalizeCommodityLabel(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function commodityCacheKey(producto: string, region: string): string {
  const product = normalizeCommodityLabel(producto).replace(/\s/g, '_');
  const place = normalizeCommodityLabel(region).replace(/\s/g, '_');
  return `${COMMODITY_CACHE_KEY_PREFIX}${product}:${place}`;
}
