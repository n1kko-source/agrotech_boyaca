import { BadRequestException } from '@nestjs/common';
import { MemoryDeviceTokenStore } from '../../src/notifications/devices.store';
import type {
  FcmClient,
  FcmSendResult,
} from '../../src/notifications/fcm/fcm.client';
import { MemoryInboxStore } from '../../src/notifications/inbox.store';
import { NotificationService } from '../../src/notifications/notifications.service';

const USER = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'fcm-test-token-android-01';
const DEVICE = 'device-siachoque-1';

class StubFcm implements FcmClient {
  readonly sent: string[] = [];
  next: FcmSendResult = 'ok';
  byToken = new Map<string, FcmSendResult>();

  send(message: { token: string }): Promise<FcmSendResult> {
    this.sent.push(message.token);
    return Promise.resolve(this.byToken.get(message.token) ?? this.next);
  }
}

function service(fcm: StubFcm = new StubFcm()) {
  const devices = new MemoryDeviceTokenStore();
  const inbox = new MemoryInboxStore();
  return {
    devices,
    inbox,
    fcm,
    svc: new NotificationService(devices, inbox, fcm),
  };
}

describe('NotificationService', () => {
  it('send() queues PENDING when the user has no device token', async () => {
    const { svc } = service();
    const result = await svc.send(USER, {
      title: 'Precio papa',
      body: 'Siachoque 2800 COP/kg',
      data: { producto: 'papa criolla' },
    });
    expect(result.status).toBe('pending');
    const pending = await svc.pending(USER);
    expect(pending.items).toHaveLength(1);
    expect(pending.items[0]?.title).toBe('Precio papa');
    expect(pending.items[0]?.data.producto).toBe('papa criolla');
  });

  it('send() marks SENT when FCM accepts, and GET pending still returns it until ack', async () => {
    const { svc } = service();
    await svc.registerDevice(USER, { token: TOKEN, deviceId: DEVICE });
    const result = await svc.send(USER, {
      title: 'Oferta',
      body: 'Nueva papa en marketplace',
    });
    expect(result.status).toBe('sent');
    const pending = await svc.pending(USER);
    expect(pending.items).toHaveLength(1);
    expect(pending.items[0]?.id).toBe(result.id);
    const ack = await svc.ack(USER, [result.id]);
    expect(ack.acked).toBe(1);
    expect((await svc.pending(USER)).items).toHaveLength(0);
  });

  it('flushes PENDING via FCM on reconnect but keeps SENT in the inbox until ack', async () => {
    const { svc, fcm, inbox } = service();
    await svc.send(USER, { title: 'Clima', body: 'Helada esta noche' });
    expect((await svc.pending(USER)).items).toHaveLength(1);

    fcm.next = 'ok';
    await svc.registerDevice(USER, { token: TOKEN, deviceId: DEVICE });
    expect(fcm.sent).toContain(TOKEN);
    expect(inbox.rows[0]?.status).toBe('SENT');
    expect((await svc.pending(USER)).items).toHaveLength(1);

    const sentCount = fcm.sent.length;
    await svc.registerDevice(USER, { token: TOKEN, deviceId: DEVICE });
    expect(fcm.sent).toHaveLength(sentCount);
  });

  it('returns pending items and ack removes them from the inbox', async () => {
    const { svc } = service();
    const sent = await svc.send(USER, {
      title: 'Match',
      body: 'Un comprador busca papa',
    });
    const pending = await svc.pending(USER);
    expect(pending.items[0]?.id).toBe(sent.id);
    const ack = await svc.ack(USER, [sent.id]);
    expect(ack.acked).toBe(1);
    expect((await svc.pending(USER)).items).toHaveLength(0);
  });

  it('drops unregistered FCM tokens and keeps generic invalid ones', async () => {
    const { svc, fcm, devices } = service();
    await svc.registerDevice(USER, {
      token: 'stale-token-unregistered',
      deviceId: 'device-old',
    });
    await devices.upsert(USER, 'device-bad', 'bad-token-invalid-xx');
    fcm.byToken.set('stale-token-unregistered', 'unregistered');
    fcm.byToken.set('bad-token-invalid-xx', 'invalid');

    const result = await svc.send(USER, {
      title: 'Aviso',
      body: 'Token muerto',
    });
    expect(result.status).toBe('pending');
    const left = await devices.listByUser(USER);
    expect(left).toHaveLength(1);
    expect(left[0]?.token).toBe('bad-token-invalid-xx');
  });

  it('keeps a valid token when a sibling token is unregistered', async () => {
    const { svc, fcm, devices } = service();
    await svc.registerDevice(USER, { token: TOKEN, deviceId: DEVICE });
    await devices.upsert(USER, 'device-dead', 'dead-token-unregistered');
    fcm.byToken.set(TOKEN, 'ok');
    fcm.byToken.set('dead-token-unregistered', 'unregistered');

    const result = await svc.send(USER, {
      title: 'Aviso',
      body: 'Uno vivo',
    });
    expect(result.status).toBe('sent');
    const left = await devices.listByUser(USER);
    expect(left).toHaveLength(1);
    expect(left[0]?.token).toBe(TOKEN);
  });

  it('onLogin without a token still flushes pending via existing devices', async () => {
    const { svc, fcm, inbox } = service();
    await svc.registerDevice(USER, { token: TOKEN, deviceId: DEVICE });
    fcm.next = 'unavailable';
    await svc.send(USER, { title: 'Offline', body: 'Sin red FCM' });
    expect((await svc.pending(USER)).items).toHaveLength(1);

    fcm.next = 'ok';
    await svc.onLogin(USER, null);
    expect(inbox.rows[0]?.status).toBe('SENT');
    expect((await svc.pending(USER)).items).toHaveLength(1);
  });

  it('rejects an empty title', async () => {
    const { svc } = service();
    await expect(
      svc.send(USER, { title: '  ', body: 'x' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
