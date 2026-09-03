import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { pemFromEnv, assertJwtRsaKeys } from './pem';
import { isProductionEnv, requirePiiKeys } from './pii-keys';

@Injectable()
export class CryptoBootstrap implements OnModuleInit {
  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    if (!isProductionEnv(this.config.get<string>('NODE_ENV'))) {
      return;
    }
    requirePiiKeys(this.config);
    assertJwtRsaKeys(
      pemFromEnv(this.config.get<string>('JWT_PRIVATE_KEY')),
      pemFromEnv(this.config.get<string>('JWT_PUBLIC_KEY')),
    );
  }
}
