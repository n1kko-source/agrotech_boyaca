import type { AlertKind } from './clima.constants';
import { CLIMA_FROST_TEMP_C, CLIMA_RAIN_POP } from './clima.constants';
import type {
  ForecastSlot,
  WeatherSnapshot,
} from './openweather/weather.client';

export function matchesAlert(
  snapshot: WeatherSnapshot,
  kind: AlertKind,
): boolean {
  if (kind === 'rain') {
    return isRainSlot(snapshot.current) || snapshot.forecast.some(isRainSlot);
  }
  return isFrostSlot(snapshot.current) || snapshot.forecast.some(isFrostSlot);
}

function isRainSlot(
  slot: Pick<ForecastSlot, 'weatherId' | 'pop' | 'rainMm'>,
): boolean {
  const id = slot.weatherId;
  if ((id >= 200 && id < 400) || (id >= 500 && id < 600)) {
    return true;
  }
  return slot.pop >= CLIMA_RAIN_POP || slot.rainMm > 0;
}

function isFrostSlot(slot: Pick<ForecastSlot, 'tempC'>): boolean {
  return slot.tempC <= CLIMA_FROST_TEMP_C;
}
