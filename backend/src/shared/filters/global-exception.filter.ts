import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ApiErrorBody, ErrorCode } from '../dto/api-error';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const body = this.toErrorBody(exception);
    const status = this.toStatus(exception);

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url?.split('?')[0]} ${status} ${this.safeName(exception)}`,
      );
    }

    response.status(status).json(body);
  }

  toStatus(exception: unknown): number {
    if (exception instanceof ThrottlerException) {
      return HttpStatus.TOO_MANY_REQUESTS;
    }
    if (isMulterLimit(exception)) {
      return HttpStatus.PAYLOAD_TOO_LARGE;
    }
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  toErrorBody(exception: unknown): ApiErrorBody {
    if (exception instanceof ThrottlerException) {
      return {
        error: { code: ErrorCode.THROTTLED, message: 'Too many requests' },
      };
    }
    if (isMulterLimit(exception)) {
      return {
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'File too large',
        },
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        error: {
          code: statusToCode(status),
          message: clientMessage(status, exception),
          ...validationDetails(exception),
        },
      };
    }
    return {
      error: { code: ErrorCode.INTERNAL, message: 'Internal server error' },
    };
  }

  private safeName(exception: unknown): string {
    if (exception instanceof Error) {
      return exception.name;
    }
    return 'Error';
  }
}

function isMulterLimit(exception: unknown): boolean {
  if (!(exception instanceof Error) || exception.name !== 'MulterError') {
    return false;
  }
  return (exception as Error & { code?: string }).code === 'LIMIT_FILE_SIZE';
}

function statusToCode(status: number): ErrorCode {
  if (status === 400) {
    return ErrorCode.VALIDATION_ERROR;
  }
  if (status === 401) {
    return ErrorCode.UNAUTHORIZED;
  }
  if (status === 403) {
    return ErrorCode.FORBIDDEN;
  }
  if (status === 404) {
    return ErrorCode.NOT_FOUND;
  }
  if (status === 409) {
    return ErrorCode.CONFLICT;
  }
  if (status === 413) {
    return ErrorCode.VALIDATION_ERROR;
  }
  if (status === 429) {
    return ErrorCode.THROTTLED;
  }
  if (status >= 500) {
    return ErrorCode.INTERNAL;
  }
  return ErrorCode.VALIDATION_ERROR;
}

function clientMessage(status: number, exception: HttpException): string {
  if (status === 401) {
    return 'Unauthorized';
  }
  if (status === 403) {
    return 'Forbidden';
  }
  if (status >= 500) {
    return 'Internal server error';
  }
  const payload = exception.getResponse();
  if (typeof payload === 'string') {
    return payload;
  }
  if (typeof payload === 'object' && payload && 'message' in payload) {
    const message = payload.message;
    if (typeof message === 'string') {
      return message;
    }
    if (Array.isArray(message)) {
      return 'Validation failed';
    }
  }
  return exception.message;
}

function validationDetails(
  exception: HttpException,
): { details: string[] } | Record<string, never> {
  if (exception.getStatus() !== 400) {
    return {};
  }
  const payload = exception.getResponse();
  if (typeof payload !== 'object' || !payload || !('message' in payload)) {
    return {};
  }
  const message = payload.message;
  if (!Array.isArray(message)) {
    return {};
  }
  const details = message.filter(
    (item): item is string => typeof item === 'string',
  );
  return details.length > 0 ? { details } : {};
}
