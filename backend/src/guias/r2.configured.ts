import { ConfigService } from '@nestjs/config';

export function r2Configured(config: ConfigService): boolean {
  return Boolean(
    config.get<string>('R2_ENDPOINT')?.trim() &&
    config.get<string>('R2_ACCESS_KEY_ID')?.trim() &&
    config.get<string>('R2_SECRET_ACCESS_KEY')?.trim() &&
    config.get<string>('R2_BUCKET')?.trim(),
  );
}
