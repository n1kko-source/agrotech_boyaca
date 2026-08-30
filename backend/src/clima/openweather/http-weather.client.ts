import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CLIMA_FETCH_TIMEOUT_MS,
  CLIMA_FORECAST_SLOTS,
} from '../clima.constants';
import type {
  ForecastSlot,
  WeatherClient,
  WeatherFetchResult,
  WeatherSnapshot,
} from './weather.client';

const GEO_URL = 'https://api.openweathermap.org/geo/1.0/direct';
const WEATHER_URL = 'https://api.openweathermap.org/data/2.5/weather';
const FORECAST_URL = 'https://api.openweathermap.org/data/2.5/forecast';

type GeoHit = {
  lat?: number;
  lon?: number;
  state?: string;
  name?: string;
};

type OwWeather = {
  id?: number;
  main?: string;
  description?: string;
};

type OwCurrent = {
  dt?: number;
  weather?: OwWeather[];
  main?: { temp?: number };
  rain?: { '1h'?: number; '3h'?: number };
  pop?: number;
};

type OwForecast = {
  list?: OwCurrent[];
};

@Injectable()
export class HttpWeatherClient implements WeatherClient {
  private readonly logger = new Logger(HttpWeatherClient.name);
  private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis);

  constructor(private readonly config: ConfigService) {}

  async fetch(municipio: string): Promise<WeatherFetchResult> {
    const apiKey = this.config.get<string>('OPENWEATHER_API_KEY')?.trim();
    if (!apiKey) {
      return { ok: false, reason: 'unavailable' };
    }
    try {
      const geo = await this.geocode(municipio, apiKey);
      if (!geo) {
        return { ok: false, reason: 'not_found' };
      }
      const [current, forecast] = await Promise.all([
        this.getJson<OwCurrent>(
          `${WEATHER_URL}?lat=${geo.lat}&lon=${geo.lon}&units=metric&lang=es&appid=${encodeURIComponent(apiKey)}`,
        ),
        this.getJson<OwForecast>(
          `${FORECAST_URL}?lat=${geo.lat}&lon=${geo.lon}&units=metric&lang=es&appid=${encodeURIComponent(apiKey)}`,
        ),
      ]);
      if (!current) {
        return { ok: false, reason: 'unavailable' };
      }
      const snapshot: WeatherSnapshot = {
        municipio,
        current: toSlot(current, Date.now()),
        forecast: (forecast?.list ?? [])
          .slice(0, CLIMA_FORECAST_SLOTS)
          .map((item) => toSlot(item, (item.dt ?? 0) * 1000)),
        fetchedAt: new Date().toISOString(),
      };
      return { ok: true, snapshot };
    } catch (err) {
      this.logger.warn(`OpenWeather fetch failed: ${errorName(err)}`);
      return { ok: false, reason: 'unavailable' };
    }
  }

  private async geocode(
    municipio: string,
    apiKey: string,
  ): Promise<{ lat: number; lon: number } | null> {
    const queries = [`${municipio},Boyaca,CO`, `${municipio},CO`];
    for (const q of queries) {
      const hits = await this.getJson<GeoHit[]>(
        `${GEO_URL}?q=${encodeURIComponent(q)}&limit=5&appid=${encodeURIComponent(apiKey)}`,
      );
      const chosen = pickBoyaca(hits ?? []);
      if (chosen) {
        return chosen;
      }
    }
    return null;
  }

  private async getJson<T>(url: string): Promise<T | null> {
    const res = await this.fetchImpl(url, {
      signal: AbortSignal.timeout(CLIMA_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      if (res.status === 404) {
        return null;
      }
      throw new Error(`HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  }
}

function pickBoyaca(hits: GeoHit[]): { lat: number; lon: number } | null {
  const withCoords = hits.filter(
    (hit) => typeof hit.lat === 'number' && typeof hit.lon === 'number',
  );
  const boyaca = withCoords.find((hit) =>
    (hit.state ?? '').toLowerCase().includes('boyac'),
  );
  const chosen = boyaca ?? withCoords[0];
  if (
    !chosen ||
    typeof chosen.lat !== 'number' ||
    typeof chosen.lon !== 'number'
  ) {
    return null;
  }
  return { lat: chosen.lat, lon: chosen.lon };
}

function toSlot(raw: OwCurrent, fallbackMs: number): ForecastSlot {
  const weather = raw.weather?.[0];
  const rainMm = raw.rain?.['3h'] ?? raw.rain?.['1h'] ?? 0;
  const atMs = raw.dt ? raw.dt * 1000 : fallbackMs;
  return {
    at: new Date(atMs).toISOString(),
    tempC: Number(raw.main?.temp ?? 0),
    weatherId: Number(weather?.id ?? 800),
    weather: weather?.main ?? 'Clear',
    description: weather?.description ?? '',
    pop: Number(raw.pop ?? 0),
    rainMm: Number(rainMm),
  };
}

function errorName(err: unknown): string {
  if (err instanceof Error) {
    return err.name;
  }
  return 'Error';
}

export function openWeatherConfigured(config: {
  get(key: string): string | undefined;
}): boolean {
  return Boolean(config.get('OPENWEATHER_API_KEY')?.trim());
}
