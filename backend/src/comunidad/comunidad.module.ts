import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import {
  CONVERSATIONS_STORE,
  MemoryConversationsStore,
  PrismaConversationsStore,
} from './conversations.store';
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
  controllers: [PostsController, ProfilesController, ConversationsController],
  providers: [
    PostsService,
    ProfilesService,
    ConversationsService,
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
    {
      provide: CONVERSATIONS_STORE,
      inject: [PrismaService, ConfigService],
      useFactory: (prisma: PrismaService, config: ConfigService) => {
        if (prisma.enabled || config.get<string>('NODE_ENV') === 'production') {
          return new PrismaConversationsStore(prisma);
        }
        return new MemoryConversationsStore();
      },
    },
  ],
})
export class ComunidadModule {}
