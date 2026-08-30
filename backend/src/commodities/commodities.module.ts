import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { CommoditiesController } from './commodities.controller';
import { CommoditiesService } from './commodities.service';
import {
  MemoryPricesStore,
  PRICES_STORE,
  PrismaPricesStore,
} from './prices.store';

@Module({
  imports: [AuthModule],
  controllers: [CommoditiesController],
  providers: [
    CommoditiesService,
    {
      provide: PRICES_STORE,
      inject: [PrismaService, ConfigService],
      useFactory: (prisma: PrismaService, config: ConfigService) => {
        if (prisma.enabled || config.get<string>('NODE_ENV') === 'production') {
          return new PrismaPricesStore(prisma);
        }
        return new MemoryPricesStore();
      },
    },
  ],
})
export class CommoditiesModule {}
