import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { AdminJuridicaController } from './admin-juridica.controller';
import { AdminJuridicaService } from './admin-juridica.service';
import { AdminPrivacyController } from './admin-privacy.controller';
import { AdminPrivacyService } from './admin-privacy.service';
import { VERIFICATION_AUDIT } from './audit/verification-audit';
import {
  MemoryVerificationAudit,
  PrismaVerificationAudit,
} from './audit/verification-audit.store';
import { ACCOUNT_MAILER } from './mailer/account-mailer';
import { LoggingAccountMailer } from './mailer/logging-account.mailer';
import { ResendAccountMailer } from './mailer/resend-account.mailer';

@Module({
  imports: [AuthModule],
  controllers: [AdminJuridicaController, AdminPrivacyController],
  providers: [
    AdminJuridicaService,
    AdminPrivacyService,
    {
      provide: VERIFICATION_AUDIT,
      inject: [PrismaService, ConfigService],
      useFactory: (prisma: PrismaService, config: ConfigService) => {
        if (prisma.enabled || config.get<string>('NODE_ENV') === 'production') {
          return new PrismaVerificationAudit(prisma);
        }
        return new MemoryVerificationAudit();
      },
    },
    {
      provide: ACCOUNT_MAILER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const key = config.get<string>('RESEND_API_KEY')?.trim();
        const from = config.get<string>('MAIL_FROM')?.trim();
        if (key && from) {
          return new ResendAccountMailer(config);
        }
        return new LoggingAccountMailer();
      },
    },
  ],
})
export class AdminModule {}
