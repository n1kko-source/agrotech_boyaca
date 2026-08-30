import { Injectable, Logger } from '@nestjs/common';
import type { FcmClient, FcmMessage, FcmSendResult } from './fcm.client';

@Injectable()
export class LoggingFcmClient implements FcmClient {
  private readonly logger = new Logger(LoggingFcmClient.name);

  send(message: FcmMessage): Promise<FcmSendResult> {
    void message;
    this.logger.log(
      'FCM skipped (credentials unset); notification stays queued',
    );
    return Promise.resolve('unavailable');
  }
}
