import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { AdminSuscripcionesController } from './admin-suscripciones.controller';
import { CLOCK, systemClock } from './clock';
import { SuscripcionesJobsController } from './suscripciones-jobs.controller';
import { SuscripcionesController } from './suscripciones.controller';
import { SuscripcionesService } from './suscripciones.service';
import {
  MemorySubscriptionsStore,
  PrismaSubscriptionsStore,
  SUBSCRIPTIONS_STORE,
} from './subscriptions.store';

@Module({
  imports: [AuthModule],
  controllers: [
    SuscripcionesController,
    AdminSuscripcionesController,
    SuscripcionesJobsController,
  ],
  providers: [
    SuscripcionesService,
    { provide: CLOCK, useValue: systemClock },
    {
      provide: SUBSCRIPTIONS_STORE,
      inject: [PrismaService, ConfigService],
      useFactory: (prisma: PrismaService, config: ConfigService) => {
        if (prisma.enabled || config.get<string>('NODE_ENV') === 'production') {
          return new PrismaSubscriptionsStore(prisma);
        }
        return new MemorySubscriptionsStore();
      },
    },
  ],
  exports: [SuscripcionesService, SUBSCRIPTIONS_STORE, CLOCK],
})
export class SuscripcionesModule {}
