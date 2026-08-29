import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const started = Date.now();
    const method = request.method;
    const path = requestPath(request);

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log(
            `${method} ${path} ${response.statusCode} ${Date.now() - started}ms`,
          );
        },
        error: (err: unknown) => {
          const status = err instanceof HttpException ? err.getStatus() : 500;
          this.logger.log(
            `${method} ${path} ${status} ${Date.now() - started}ms`,
          );
        },
      }),
    );
  }
}

function requestPath(request: Request): string {
  const raw = request.originalUrl ?? request.url ?? '';
  const q = raw.indexOf('?');
  return q === -1 ? raw : raw.slice(0, q);
}
