export const FCM_CLIENT = Symbol('FCM_CLIENT');

export type FcmSendResult = 'ok' | 'unregistered' | 'invalid' | 'unavailable';

export type FcmMessage = {
  token: string;
  title: string;
  body: string;
  data: Record<string, string>;
};

export interface FcmClient {
  send(message: FcmMessage): Promise<FcmSendResult>;
}
