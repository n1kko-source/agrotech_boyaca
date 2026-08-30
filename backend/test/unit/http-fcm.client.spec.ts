import { generateKeyPairSync } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { HttpFcmClient } from '../../src/notifications/fcm/http-fcm.client';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

function config(): ConfigService {
  const values: Record<string, string> = {
    FIREBASE_PROJECT_ID: 'agrotech-test',
    FIREBASE_CLIENT_EMAIL: 'fcm@agrotech.iam.gserviceaccount.com',
    FIREBASE_PRIVATE_KEY: privateKey,
  };
  return { get: (key: string) => values[key] } as ConfigService;
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('HttpFcmClient', () => {
  const message = {
    token: 'fcm-test-token-android-01',
    title: 'Precio',
    body: 'Papa 2800',
    data: { notificationId: 'n-1' },
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns ok when FCM HTTP v1 accepts the message', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { access_token: 'ya29.tok', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { name: 'projects/x/messages/1' }),
      );
    jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

    const client = new HttpFcmClient(config());
    await expect(client.send(message)).resolves.toBe('ok');
    const sendCall = fetchMock.mock.calls[1] as
      [string, { body?: string; headers?: unknown }] | undefined;
    expect(sendCall?.[0]).toContain('/v1/projects/agrotech-test/messages:send');
    expect(sendCall?.[1]?.body ?? '').not.toContain('ya29.tok');
    expect(JSON.stringify(sendCall?.[1]?.headers ?? {})).not.toContain(
      'fcm-test-token-android-01',
    );
  });

  it('maps UNREGISTERED to unregistered', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { access_token: 'ya29.tok', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(
        jsonResponse(404, {
          error: {
            status: 'NOT_FOUND',
            details: [{ errorCode: 'UNREGISTERED' }],
          },
        }),
      );
    jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);
    const client = new HttpFcmClient(config());
    await expect(client.send(message)).resolves.toBe('unregistered');
  });

  it('maps generic INVALID_ARGUMENT / HTTP 400 to unavailable', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { access_token: 'ya29.tok', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(
        jsonResponse(400, { error: { status: 'INVALID_ARGUMENT' } }),
      );
    jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);
    const client = new HttpFcmClient(config());
    await expect(client.send(message)).resolves.toBe('unavailable');
  });

  it('maps SENDER_ID_MISMATCH to unregistered even under INVALID_ARGUMENT', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { access_token: 'ya29.tok', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(
        jsonResponse(400, {
          error: {
            status: 'INVALID_ARGUMENT',
            details: [{ errorCode: 'SENDER_ID_MISMATCH' }],
          },
        }),
      );
    jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);
    const client = new HttpFcmClient(config());
    await expect(client.send(message)).resolves.toBe('unregistered');
  });

  it('maps provider outages to unavailable without throwing', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { access_token: 'ya29.tok', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(
        jsonResponse(503, { error: { status: 'UNAVAILABLE' } }),
      );
    jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);
    const client = new HttpFcmClient(config());
    await expect(client.send(message)).resolves.toBe('unavailable');
  });

  it('reuses a cached access token across sends', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { access_token: 'ya29.tok', expires_in: 3600 }),
      )
      .mockResolvedValue(jsonResponse(200, { name: 'projects/x/messages/1' }));
    jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);
    const client = new HttpFcmClient(config());
    await client.send(message);
    await client.send(message);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
