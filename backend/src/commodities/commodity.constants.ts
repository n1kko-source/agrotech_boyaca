/** Cache TTL: short so plaza prices stay fresh; 60s keeps Redis GETs bounded. */
export const COMMODITY_PRICE_CACHE_TTL_SECONDS = 60;
export const COMMODITY_CACHE_KEY_PREFIX = 'agrotech:cmdty:';
export const COMMODITY_MONEDA = 'COP';
export const COMMODITY_UNIDAD_DEFAULT = 'kg';
