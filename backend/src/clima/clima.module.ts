import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AlertasController } from './alertas.controller';
import {
  MemoryWeatherAlertStore,
  PrismaWeatherAlertStore,
  WEATHER_ALERTS,
} from './alerts.store';
import { ClimaController } from './clima.controller';
import { ClimaService } from './clima.service';
import { CLIMA_EVENTS } from './events/clima.events';
import { ClimaGateway } from './events/clima.gateway';
import {
  HttpWeatherClient,
  openWeatherConfigured,
} from './openweather/http-weather.client';
import { LoggingWeatherClient } from './openweather/logging-weather.client';
import { WEATHER_CLIENT } from './openweather/weather.client';

@Module({
  controllers: [ClimaController, AlertasController],
  providers: [
    ClimaService,
    ClimaGateway,
    { provide: CLIMA_EVENTS, useExisting: ClimaGateway },
    {
      provide: WEATHER_ALERTS,
      inject: [PrismaService, ConfigService],
      useFactory: (prisma: PrismaService, config: ConfigService) => {
        if (prisma.enabled || config.get<string>('NODE_ENV') === 'production') {
          return new PrismaWeatherAlertStore(prisma);
        }
        return new MemoryWeatherAlertStore();
      },
    },
    {
      provide: WEATHER_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        if (openWeatherConfigured(config)) {
          return new HttpWeatherClient(config);
        }
        return new LoggingWeatherClient();
      },
    },
  ],
})
export class ClimaModule {}
