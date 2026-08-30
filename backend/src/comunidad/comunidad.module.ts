import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { MemoryPostsStore, POSTS_STORE, PrismaPostsStore } from './posts.store';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';
import {
  MemoryProfilesStore,
  PROFILES_STORE,
  PrismaProfilesStore,
} from './profiles.store';

@Module({
  controllers: [PostsController, ProfilesController],
  providers: [
    PostsService,
    ProfilesService,
    {
      provide: POSTS_STORE,
      inject: [PrismaService, ConfigService],
      useFactory: (prisma: PrismaService, config: ConfigService) => {
        if (prisma.enabled || config.get<string>('NODE_ENV') === 'production') {
          return new PrismaPostsStore(prisma);
        }
        return new MemoryPostsStore();
      },
    },
    {
      provide: PROFILES_STORE,
      inject: [PrismaService, ConfigService],
      useFactory: (prisma: PrismaService, config: ConfigService) => {
        if (prisma.enabled || config.get<string>('NODE_ENV') === 'production') {
          return new PrismaProfilesStore(prisma);
        }
        return new MemoryProfilesStore();
      },
    },
  ],
})
export class ComunidadModule {}
