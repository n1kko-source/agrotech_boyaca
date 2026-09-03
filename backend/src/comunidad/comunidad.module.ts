import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  SUBSCRIPTIONS_STORE,
  type SubscriptionsStore,
} from '../suscripciones/subscriptions.store';
import { SuscripcionesModule } from '../suscripciones/suscripciones.module';
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
  imports: [SuscripcionesModule],
  controllers: [PostsController, ProfilesController, ConversationsController],
  providers: [
    PostsService,
    ProfilesService,
    ConversationsService,
    {
      provide: POSTS_STORE,
      inject: [PrismaService, ConfigService, SUBSCRIPTIONS_STORE],
      useFactory: (
        prisma: PrismaService,
        config: ConfigService,
        subscriptions: SubscriptionsStore,
      ) => {
        if (prisma.enabled || config.get<string>('NODE_ENV') === 'production') {
          return new PrismaPostsStore(prisma);
        }
        return new MemoryPostsStore(subscriptions);
      },
    },
    {
      provide: PROFILES_STORE,
      inject: [PrismaService, ConfigService, SUBSCRIPTIONS_STORE],
      useFactory: (
        prisma: PrismaService,
        config: ConfigService,
        subscriptions: SubscriptionsStore,
      ) => {
        if (prisma.enabled || config.get<string>('NODE_ENV') === 'production') {
          return new PrismaProfilesStore(prisma);
        }
        return new MemoryProfilesStore(subscriptions);
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
  exports: [
    PostsService,
    ProfilesService,
    ConversationsService,
    POSTS_STORE,
    PROFILES_STORE,
    CONVERSATIONS_STORE,
  ],
})
export class ComunidadModule {}
