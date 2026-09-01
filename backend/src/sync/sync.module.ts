import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClimaModule } from '../clima/clima.module';
import { CommoditiesModule } from '../commodities/commodities.module';
import { ComunidadModule } from '../comunidad/comunidad.module';
import { PrismaService } from '../prisma/prisma.service';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { MemorySyncStore, PrismaSyncStore, SYNC_STORE } from './sync.store';

@Module({
  imports: [ComunidadModule, ClimaModule, CommoditiesModule],
  controllers: [SyncController],
  providers: [
    SyncService,
    {
      provide: SYNC_STORE,
      inject: [PrismaService, ConfigService],
      useFactory: (prisma: PrismaService, config: ConfigService) => {
        if (prisma.enabled || config.get<string>('NODE_ENV') === 'production') {
          return new PrismaSyncStore(prisma);
        }
        return new MemorySyncStore();
      },
    },
  ],
})
export class SyncModule {}
