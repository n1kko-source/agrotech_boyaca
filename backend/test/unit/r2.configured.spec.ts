import { ConfigService } from '@nestjs/config';
import { r2Configured } from '../../src/guias/r2.configured';

describe('r2Configured', () => {
  it('requires endpoint, keys and bucket', () => {
    const empty = {
      get: () => undefined,
    } as unknown as ConfigService;
    expect(r2Configured(empty)).toBe(false);

    const full = {
      get: (key: string) =>
        ({
          R2_ENDPOINT: 'https://abc.r2.cloudflarestorage.com',
          R2_ACCESS_KEY_ID: 'id',
          R2_SECRET_ACCESS_KEY: 'secret',
          R2_BUCKET: 'agrotech-boyaca',
        })[key],
    } as unknown as ConfigService;
    expect(r2Configured(full)).toBe(true);
  });
});
