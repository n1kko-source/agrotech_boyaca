import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LegalController } from '../legal/legal.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaService } from '../prisma/prisma.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { FirebaseEmailClient } from './email/firebase-email.client';
import { FirebaseOtpClient } from './otp/firebase-otp.client';
import {
  OTP_CODE_GENERATOR,
  OtpService,
  randomOtpCode,
} from './otp/otp.service';
import { DELETION_REQUESTS } from './privacy/deletion-request';
import {
  MemoryDeletionRequestStore,
  PrismaDeletionRequestStore,
} from './privacy/deletion-request.store';
import { TokenService } from './tokens/token.service';
import {
  InMemoryUsersRepository,
  PrismaUsersRepository,
  USERS_REPOSITORY,
} from './users/users.repository';

@Module({
  imports: [NotificationsModule],
  controllers: [AuthController, LegalController],
  providers: [
    AuthService,
    OtpService,
    TokenService,
    FirebaseOtpClient,
    FirebaseEmailClient,
    { provide: OTP_CODE_GENERATOR, useValue: randomOtpCode },
    {
      provide: USERS_REPOSITORY,
      inject: [PrismaService, ConfigService],
      useFactory: (prisma: PrismaService, config: ConfigService) => {
        if (prisma.enabled || config.get<string>('NODE_ENV') === 'production') {
          return new PrismaUsersRepository(prisma, config);
        }
        return new InMemoryUsersRepository(config);
      },
    },
    {
      provide: DELETION_REQUESTS,
      inject: [PrismaService, ConfigService],
      useFactory: (prisma: PrismaService, config: ConfigService) => {
        if (prisma.enabled || config.get<string>('NODE_ENV') === 'production') {
          return new PrismaDeletionRequestStore(prisma);
        }
        return new MemoryDeletionRequestStore();
      },
    },
  ],
  exports: [
    TokenService,
    FirebaseEmailClient,
    USERS_REPOSITORY,
    DELETION_REQUESTS,
  ],
})
export class AuthModule {}
