export const WEATHER_CLIENT = Symbol('WEATHER_CLIENT');

export type ForecastSlot = {
  at: string;
  tempC: number;
  weatherId: number;
  weather: string;
  description: string;
  pop: number;
  rainMm: number;
};

export type WeatherSnapshot = {
  municipio: string;
  current: ForecastSlot;
  forecast: ForecastSlot[];
  fetchedAt: string;
};

export type WeatherFetchResult =
  | { ok: true; snapshot: WeatherSnapshot }
  | { ok: false; reason: 'not_found' | 'unavailable' };

export interface WeatherClient {
  fetch(municipio: string): Promise<WeatherFetchResult>;
}
