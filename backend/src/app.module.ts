import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ComunidadModule } from './comunidad/comunidad.module';
import { PrismaModule } from './prisma/prisma.module';
import { SharedModule } from './shared/shared.module';

@Module({
  imports: [
    SharedModule,
    PrismaModule,
    AuthModule,
    AdminModule,
    ComunidadModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
