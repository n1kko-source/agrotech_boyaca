import { json, urlencoded } from 'express';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger as PinoNestLogger } from 'nestjs-pino';
import { gzipBrotliMiddleware } from './compress/gzip-brotli.middleware';

/** JSON / urlencoded body cap. Sync batches of 50 ops fit with headroom. */
export const JSON_BODY_LIMIT = '256kb';

export const NEST_BODY_PARSER_OFF = { bodyParser: false as const };

export function configureApp(app: INestApplication): void {
  const http = app as NestExpressApplication;
  if (typeof http.set === 'function') {
    http.set('trust proxy', 1);
  }
  applyJsonBodyLimit(http);
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      hsts: { maxAge: 15_552_000, includeSubDomains: true },
    }),
  );
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

function applyJsonBodyLimit(http: NestExpressApplication): void {
  if (typeof http.useBodyParser === 'function') {
    http.useBodyParser('json', { limit: JSON_BODY_LIMIT });
    http.useBodyParser('urlencoded', {
      limit: JSON_BODY_LIMIT,
      extended: true,
    });
    return;
  }
  http.use(json({ limit: JSON_BODY_LIMIT }));
  http.use(urlencoded({ limit: JSON_BODY_LIMIT, extended: true }));
}
