import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ClimaModule } from './clima/clima.module';
import { CommoditiesModule } from './commodities/commodities.module';
import { ComunidadModule } from './comunidad/comunidad.module';
import { GuiasModule } from './guias/guias.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { SharedModule } from './shared/shared.module';
import { SyncModule } from './sync/sync.module';

@Module({
  imports: [
    SharedModule,
    PrismaModule,
    NotificationsModule,
    AuthModule,
    AdminModule,
    ComunidadModule,
    CommoditiesModule,
    ClimaModule,
    GuiasModule,
    SyncModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
