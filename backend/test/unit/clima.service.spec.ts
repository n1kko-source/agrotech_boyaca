import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MemoryWeatherAlertStore } from '../../src/clima/alerts.store';
import { ClimaService } from '../../src/clima/clima.service';
import type { ClimaEvents } from '../../src/clima/events/clima.events';
import type {
  WeatherClient,
  WeatherFetchResult,
  WeatherSnapshot,
} from '../../src/clima/openweather/weather.client';
import { NotificationService } from '../../src/notifications/notifications.service';
import { MemoryKvStore } from '../../src/shared/redis/memory-kv.store';

const USER = '11111111-1111-4111-8111-111111111111';

function rainSnapshot(municipio = 'siachoque'): WeatherSnapshot {
  return {
    municipio,
    current: {
      at: '2026-08-30T12:00:00.000Z',
      tempC: 12,
      weatherId: 500,
      weather: 'Rain',
      description: 'lluvia ligera',
      pop: 0.8,
      rainMm: 1.2,
    },
    forecast: [],
    fetchedAt: '2026-08-30T12:00:00.000Z',
  };
}

function clearSnapshot(municipio = 'siachoque'): WeatherSnapshot {
  return {
    municipio,
    current: {
      at: '2026-08-30T12:00:00.000Z',
      tempC: 14,
      weatherId: 800,
      weather: 'Clear',
      description: 'cielo claro',
      pop: 0,
      rainMm: 0,
    },
    forecast: [],
    fetchedAt: '2026-08-30T12:00:00.000Z',
  };
}

class StubWeather implements WeatherClient {
  next: WeatherFetchResult = { ok: true, snapshot: rainSnapshot() };
  calls = 0;

  fetch(): Promise<WeatherFetchResult> {
    this.calls += 1;
    return Promise.resolve(this.next);
  }
}

function eventsStub(): ClimaEvents & { emitted: unknown[] } {
  const emitted: unknown[] = [];
  return {
    emitted,
    emitAlert(userId, payload) {
      emitted.push({ userId, payload });
    },
  };
}

function notificationsStub(
  send: NotificationService['send'] = jest.fn().mockResolvedValue({
    id: 'n-1',
    status: 'pending',
  }),
): NotificationService {
  return { send } as unknown as NotificationService;
}

function service(opts?: {
  weather?: StubWeather;
  alerts?: MemoryWeatherAlertStore;
  kv?: MemoryKvStore;
  events?: ClimaEvents & { emitted: unknown[] };
  notifications?: NotificationService;
  jobSecret?: string;
}) {
  const weather = opts?.weather ?? new StubWeather();
  const alerts = opts?.alerts ?? new MemoryWeatherAlertStore();
  const kv = opts?.kv ?? new MemoryKvStore();
  const events = opts?.events ?? eventsStub();
  const notifications = opts?.notifications ?? notificationsStub();
  const config = {
    get: (key: string) =>
      key === 'CLIMA_JOB_SECRET'
        ? (opts?.jobSecret ?? 'job-secret')
        : undefined,
  } as ConfigService;
  return {
    weather,
    alerts,
    kv,
    events,
    notifications,
    svc: new ClimaService(weather, alerts, kv, events, notifications, config),
  };
}

describe('ClimaService', () => {
  it('returns current weather + short forecast and caches on Redis', async () => {
    const { svc, weather } = service();
    const first = await svc.get('Siachoque');
    expect(first.cached).toBe(false);
    expect(first.municipio).toBe('siachoque');
    expect(first.current.weather).toBe('Rain');
    expect(weather.calls).toBe(1);

    const second = await svc.get('  SIACHOQUE ');
    expect(second.cached).toBe(true);
    expect(weather.calls).toBe(1);
  });

  it('rejects an invalid municipio', async () => {
    const { svc } = service();
    await expect(svc.get('x')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('upserts a rain alert and lists it for the owner', async () => {
    const { svc } = service();
    const created = await svc.upsertAlert(USER, {
      municipio: 'Siachoque',
      kind: 'rain',
    });
    expect(created.municipio).toBe('siachoque');
    expect(created.kind).toBe('rain');
    expect(created.enabled).toBe(true);
    const list = await svc.listAlerts(USER);
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.id).toBe(created.id);
  });

  it('evaluates active rain alerts, pushes via NotificationService, and emits WS', async () => {
    const send = jest.fn().mockResolvedValue({ id: 'n-1', status: 'pending' });
    const { svc, events, weather } = service({
      notifications: notificationsStub(send),
    });
    await svc.upsertAlert(USER, { municipio: 'siachoque', kind: 'rain' });
    weather.next = { ok: true, snapshot: rainSnapshot() };

    const result = await svc.evaluateAlerts();
    expect(result).toEqual({ evaluated: 1, fired: 1 });
    expect(send).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({
        title: 'Lluvia en siachoque',
        data: { type: 'clima', municipio: 'siachoque', kind: 'rain' },
      }),
    );
    expect(events.emitted).toHaveLength(1);

    const again = await svc.evaluateAlerts();
    expect(again.fired).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not fire when the forecast is clear', async () => {
    const send = jest.fn();
    const { svc, weather } = service({
      notifications: notificationsStub(send),
    });
    await svc.upsertAlert(USER, { municipio: 'siachoque', kind: 'rain' });
    weather.next = { ok: true, snapshot: clearSnapshot() };
    const result = await svc.evaluateAlerts();
    expect(result.fired).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects a missing job secret', () => {
    const { svc } = service({ jobSecret: 'expected-secret' });
    expect(() => svc.assertJobSecret(undefined)).toThrow('Unauthorized');
    expect(() => svc.assertJobSecret('wrong')).toThrow('Unauthorized');
    expect(() => svc.assertJobSecret('expected-secret')).not.toThrow();
  });
});
