import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEVICE_TOKENS,
  MemoryDeviceTokenStore,
  PrismaDeviceTokenStore,
} from './devices.store';
import { FCM_CLIENT } from './fcm/fcm.client';
import { fcmCredentialsConfigured, HttpFcmClient } from './fcm/http-fcm.client';
import { LoggingFcmClient } from './fcm/logging-fcm.client';
import { INBOX, MemoryInboxStore, PrismaInboxStore } from './inbox.store';
import { NotificationsController } from './notifications.controller';
import { NotificationService } from './notifications.service';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationService,
    {
      provide: DEVICE_TOKENS,
      inject: [PrismaService, ConfigService],
      useFactory: (prisma: PrismaService, config: ConfigService) => {
        if (prisma.enabled || config.get<string>('NODE_ENV') === 'production') {
          return new PrismaDeviceTokenStore(prisma);
        }
        return new MemoryDeviceTokenStore();
      },
    },
    {
      provide: INBOX,
      inject: [PrismaService, ConfigService],
      useFactory: (prisma: PrismaService, config: ConfigService) => {
        if (prisma.enabled || config.get<string>('NODE_ENV') === 'production') {
          return new PrismaInboxStore(prisma);
        }
        return new MemoryInboxStore();
      },
    },
    {
      provide: FCM_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        if (fcmCredentialsConfigured(config)) {
          return new HttpFcmClient(config);
        }
        return new LoggingFcmClient();
      },
    },
  ],
  exports: [NotificationService],
})
export class NotificationsModule {}
