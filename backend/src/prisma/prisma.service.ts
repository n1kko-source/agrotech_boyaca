import {
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService implements OnModuleDestroy {
  private readonly client: PrismaClient | null;

  constructor(config: ConfigService) {
    const url = config.get<string>('DATABASE_URL');
    this.client = url?.trim() ? new PrismaClient() : null;
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  get db(): PrismaClient {
    if (!this.client) {
      throw new ServiceUnavailableException('Database unavailable');
    }
    return this.client;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.$disconnect();
  }
}
