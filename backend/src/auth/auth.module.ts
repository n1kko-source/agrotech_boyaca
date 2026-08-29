import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { FirebaseOtpClient } from './otp/firebase-otp.client';
import {
  OTP_CODE_GENERATOR,
  OtpService,
  randomOtpCode,
} from './otp/otp.service';
import { TokenService } from './tokens/token.service';
import {
  InMemoryUsersRepository,
  PrismaUsersRepository,
  USERS_REPOSITORY,
} from './users/users.repository';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    TokenService,
    FirebaseOtpClient,
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
  ],
})
export class AuthModule {}
