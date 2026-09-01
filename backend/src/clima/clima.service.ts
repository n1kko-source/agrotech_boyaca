import { createHash, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NOTIFICATION_TITLE_MAX } from '../notifications/notification.constants';
import { NotificationService } from '../notifications/notifications.service';
import { KV_STORE } from '../shared/redis/kv-store';
import type { KvStore } from '../shared/redis/kv-store';
import { WEATHER_ALERTS } from './alerts.store';
import type { WeatherAlertRecord, WeatherAlertStore } from './alerts.store';
import {
  CLIMA_CACHE_TTL_SECONDS,
  CLIMA_FIRE_COOLDOWN_MS,
  type AlertKind,
} from './clima.constants';
import { CLIMA_EVENTS } from './events/clima.events';
import type { ClimaEvents } from './events/clima.events';
import { climaCacheKey, normalizeMunicipio } from './municipio';
import { WEATHER_CLIENT } from './openweather/weather.client';
import type {
  WeatherClient,
  WeatherSnapshot,
} from './openweather/weather.client';
import { matchesAlert } from './weather-rules';

export type ClimaView = WeatherSnapshot & { cached: boolean };

export type AlertView = {
  id: string;
  municipio: string;
  kind: AlertKind;
  enabled: boolean;
};

export type EvaluateResult = {
  evaluated: number;
  fired: number;
};

@Injectable()
export class ClimaService {
  private readonly logger = new Logger(ClimaService.name);

  constructor(
    @Inject(WEATHER_CLIENT) private readonly weather: WeatherClient,
    @Inject(WEATHER_ALERTS) private readonly alerts: WeatherAlertStore,
    @Inject(KV_STORE) private readonly kv: KvStore,
    @Inject(CLIMA_EVENTS) private readonly events: ClimaEvents,
    private readonly notifications: NotificationService,
    private readonly config: ConfigService,
  ) {}

  async get(municipioRaw: string): Promise<ClimaView> {
    const municipio = requireMunicipio(municipioRaw);
    const cached = await this.readCache(municipio);
    if (cached) {
      return { ...cached, cached: true };
    }
    const result = await this.weather.fetch(municipio);
    if (!result.ok) {
      if (result.reason === 'not_found') {
        throw new NotFoundException('Not found');
      }
      throw new ServiceUnavailableException('Weather unavailable');
    }
    await this.writeCache(municipio, result.snapshot);
    return { ...result.snapshot, cached: false };
  }

  async upsertAlert(
    userId: string,
    input: {
      municipio: string;
      kind: AlertKind;
      enabled?: boolean;
      id?: string;
    },
  ): Promise<AlertView> {
    const municipio = requireMunicipio(input.municipio);
    const kind = requireKind(input.kind);
    const row = await this.alerts.upsert({
      id: input.id,
      userId,
      municipio,
      kind,
      enabled: input.enabled !== false,
    });
    return toAlertView(row);
  }

  async listAlerts(userId: string): Promise<{ items: AlertView[] }> {
    const rows = await this.alerts.listByUser(userId);
    return { items: rows.map(toAlertView) };
  }

  assertJobSecret(provided: string | undefined): void {
    const expected = this.config.get<string>('CLIMA_JOB_SECRET')?.trim();
    if (!expected || !provided || !secretsEqual(provided, expected)) {
      throw new UnauthorizedException('Unauthorized');
    }
  }

  async evaluateAlerts(): Promise<EvaluateResult> {
    const rows = await this.alerts.listEnabled();
    const byMunicipio = new Map<string, WeatherAlertRecord[]>();
    for (const row of rows) {
      const list = byMunicipio.get(row.municipio) ?? [];
      list.push(row);
      byMunicipio.set(row.municipio, list);
    }
    let fired = 0;
    for (const [municipio, group] of byMunicipio) {
      let snapshot: WeatherSnapshot;
      try {
        snapshot = await this.get(municipio);
      } catch {
        this.logger.warn(`Skip alert evaluation municipio=${municipio}`);
        continue;
      }
      for (const alert of group) {
        if (!matchesAlert(snapshot, alert.kind)) {
          continue;
        }
        if (recentlyFired(alert.lastFiredAt)) {
          continue;
        }
        const message = alertMessage(alert.municipio, alert.kind);
        try {
          await this.notifications.send(alert.userId, {
            title: message.title,
            body: message.body,
            data: {
              type: 'clima',
              municipio: alert.municipio,
              kind: alert.kind,
            },
          });
          this.events.emitAlert(alert.userId, {
            municipio: alert.municipio,
            kind: alert.kind,
            title: message.title,
            body: message.body,
          });
          await this.alerts.markFired(alert.id, new Date());
          fired += 1;
        } catch {
          this.logger.warn(`Alert fire failed id=${alert.id}`);
        }
      }
    }
    return { evaluated: rows.length, fired };
  }

  private async readCache(municipio: string): Promise<WeatherSnapshot | null> {
    try {
      const raw = await this.kv.get(climaCacheKey(municipio));
      if (!raw) {
        return null;
      }
      return parseSnapshot(raw);
    } catch {
      return null;
    }
  }

  private async writeCache(
    municipio: string,
    snapshot: WeatherSnapshot,
  ): Promise<void> {
    try {
      await this.kv.set(
        climaCacheKey(municipio),
        JSON.stringify(snapshot),
        CLIMA_CACHE_TTL_SECONDS,
      );
    } catch {
      // Source of truth is OpenWeather; cache is optional.
    }
  }
}

function requireMunicipio(raw: string): string {
  const municipio = normalizeMunicipio(raw);
  if (!municipio) {
    throw new BadRequestException('Invalid municipio');
  }
  return municipio;
}

function requireKind(raw: string): AlertKind {
  if (raw === 'rain' || raw === 'frost') {
    return raw;
  }
  throw new BadRequestException('Invalid kind');
}

function recentlyFired(lastFiredAt: Date | null): boolean {
  if (!lastFiredAt) {
    return false;
  }
  return Date.now() - lastFiredAt.getTime() < CLIMA_FIRE_COOLDOWN_MS;
}

function alertMessage(
  municipio: string,
  kind: AlertKind,
): { title: string; body: string } {
  const title =
    kind === 'rain' ? `Lluvia en ${municipio}` : `Helada en ${municipio}`;
  const body =
    kind === 'rain'
      ? 'Se espera lluvia en las próximas 24 h.'
      : 'Temperatura baja (≤ 2 °C) en las próximas 24 h.';
  return {
    title: title.slice(0, NOTIFICATION_TITLE_MAX),
    body,
  };
}

function toAlertView(row: WeatherAlertRecord): AlertView {
  return {
    id: row.id,
    municipio: row.municipio,
    kind: row.kind,
    enabled: row.enabled,
  };
}

function parseSnapshot(raw: string): WeatherSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as WeatherSnapshot;
    if (
      typeof parsed.municipio !== 'string' ||
      !parsed.current ||
      !Array.isArray(parsed.forecast) ||
      typeof parsed.fetchedAt !== 'string'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function secretsEqual(left: string, right: string): boolean {
  const a = createHash('sha256').update(left).digest();
  const b = createHash('sha256').update(right).digest();
  return timingSafeEqual(a, b);
}
