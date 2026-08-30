import { matchesAlert } from '../../src/clima/weather-rules';
import type { WeatherSnapshot } from '../../src/clima/openweather/weather.client';

function slot(overrides: Partial<WeatherSnapshot['current']> = {}) {
  return {
    at: '2026-08-30T12:00:00.000Z',
    tempC: 12,
    weatherId: 800,
    weather: 'Clear',
    description: '',
    pop: 0,
    rainMm: 0,
    ...overrides,
  };
}

describe('weather-rules', () => {
  it('matches rain on weather id, pop, or rain mm', () => {
    const rain: WeatherSnapshot = {
      municipio: 'siachoque',
      current: slot(),
      forecast: [slot({ weatherId: 501, weather: 'Rain' })],
      fetchedAt: '2026-08-30T12:00:00.000Z',
    };
    expect(matchesAlert(rain, 'rain')).toBe(true);
    expect(
      matchesAlert(
        {
          ...rain,
          forecast: [slot({ pop: 0.5 })],
        },
        'rain',
      ),
    ).toBe(true);
    expect(matchesAlert({ ...rain, forecast: [] }, 'rain')).toBe(false);
  });

  it('matches frost at or below 2 °C', () => {
    const frost: WeatherSnapshot = {
      municipio: 'siachoque',
      current: slot({ tempC: 1.5 }),
      forecast: [],
      fetchedAt: '2026-08-30T12:00:00.000Z',
    };
    expect(matchesAlert(frost, 'frost')).toBe(true);
    expect(
      matchesAlert({ ...frost, current: slot({ tempC: 8 }) }, 'frost'),
    ).toBe(false);
  });
});
