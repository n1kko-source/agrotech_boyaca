import { Params } from 'nestjs-pino';
import { PINO_REDACT_PATHS } from './redact';

export function pinoLoggerParams(): Params {
  const production = process.env.NODE_ENV === 'production';
  const test = process.env.NODE_ENV === 'test';
  return {
    pinoHttp: {
      level: test ? 'silent' : production ? 'info' : 'debug',
      autoLogging: false,
      redact: {
        paths: PINO_REDACT_PATHS,
        censor: '[Redacted]',
      },
      serializers: {
        req: (req: { method?: string; url?: string }) => ({
          method: req.method,
          url: req.url?.split('?')[0],
        }),
        res: (res: { statusCode?: number }) => ({
          statusCode: res.statusCode,
        }),
      },
    },
  };
}
