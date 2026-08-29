import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger as PinoNestLogger } from 'nestjs-pino';
import { gzipBrotliMiddleware } from './compress/gzip-brotli.middleware';

export function configureApp(app: INestApplication): void {
  const http = app as NestExpressApplication;
  if (typeof http.set === 'function') {
    http.set('trust proxy', 1);
  }
  app.use(helmet());
  app.use(gzipBrotliMiddleware);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();
  app.useLogger(app.get(PinoNestLogger));
}
