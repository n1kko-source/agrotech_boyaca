export const CLIMA_CACHE_TTL_SECONDS = 3 * 60 * 60;
export const CLIMA_CACHE_KEY_PREFIX = 'agrotech:clima:';
export const CLIMA_FETCH_TIMEOUT_MS = 5_000;
export const CLIMA_FORECAST_SLOTS = 8;
export const CLIMA_LOOKAHEAD_HOURS = 24;
export const CLIMA_FIRE_COOLDOWN_MS = 12 * 60 * 60 * 1000;
export const CLIMA_FROST_TEMP_C = 2;
export const CLIMA_RAIN_POP = 0.4;
export const MUNICIPIO_MIN = 2;
export const MUNICIPIO_MAX = 80;
export const ALERT_KINDS = ['rain', 'frost'] as const;

export type AlertKind = (typeof ALERT_KINDS)[number];
