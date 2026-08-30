import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  AUDIO_COMPRESSOR,
  FfmpegAudioCompressor,
  PassthroughAudioCompressor,
  ffmpegAvailable,
} from './audio.compressor';
import { GuiasController } from './guias.controller';
import { GuiasService } from './guias.service';
import { GUIAS_STORE, MemoryGuiasStore, PrismaGuiasStore } from './guias.store';
import {
  MemoryObjectStore,
  OBJECT_STORE,
  UnavailableObjectStore,
} from './object.store';
import { r2Configured } from './r2.configured';
import { R2ObjectStore } from './r2.object-store';
import { R2UsageMeter } from './r2-usage.meter';

@Module({
  controllers: [GuiasController],
  providers: [
    GuiasService,
    R2UsageMeter,
    {
      provide: GUIAS_STORE,
      inject: [PrismaService, ConfigService],
      useFactory: (prisma: PrismaService, config: ConfigService) => {
        if (prisma.enabled || config.get<string>('NODE_ENV') === 'production') {
          return new PrismaGuiasStore(prisma);
        }
        return new MemoryGuiasStore();
      },
    },
    {
      provide: OBJECT_STORE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        if (process.env.NODE_ENV === 'test') {
          return new MemoryObjectStore();
        }
        if (r2Configured(config)) {
          return new R2ObjectStore(config);
        }
        if (config.get<string>('NODE_ENV') === 'production') {
          return new UnavailableObjectStore();
        }
        return new MemoryObjectStore();
      },
    },
    {
      provide: AUDIO_COMPRESSOR,
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        if (process.env.NODE_ENV === 'test') {
          return new PassthroughAudioCompressor();
        }
        if (await ffmpegAvailable()) {
          return new FfmpegAudioCompressor();
        }
        if (config.get<string>('NODE_ENV') === 'production') {
          return new FfmpegAudioCompressor();
        }
        return new PassthroughAudioCompressor();
      },
    },
  ],
  exports: [R2UsageMeter],
})
export class GuiasModule {}
