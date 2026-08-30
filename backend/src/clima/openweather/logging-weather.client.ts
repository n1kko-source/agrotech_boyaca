import { Injectable, Logger } from '@nestjs/common';
import type { WeatherClient, WeatherFetchResult } from './weather.client';

@Injectable()
export class LoggingWeatherClient implements WeatherClient {
  private readonly logger = new Logger(LoggingWeatherClient.name);

  fetch(municipio: string): Promise<WeatherFetchResult> {
    void municipio;
    this.logger.log('OpenWeather skipped (OPENWEATHER_API_KEY unset)');
    return Promise.resolve({ ok: false, reason: 'unavailable' });
  }
}
