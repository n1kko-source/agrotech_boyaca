import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { ErrorCode } from '../../src/shared/dto/api-error';
import { GlobalExceptionFilter } from '../../src/shared/filters/global-exception.filter';

describe('GlobalExceptionFilter', () => {
  const filter = new GlobalExceptionFilter();

  function hostWith(json: jest.Mock, status: jest.Mock): ArgumentsHost {
    status.mockReturnValue({ json });
    return {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ method: 'GET', url: '/x' }),
      }),
    } as unknown as ArgumentsHost;
  }

  it('maps 404 to NOT_FOUND', () => {
    const json = jest.fn();
    const status = jest.fn();
    filter.catch(new NotFoundException(), hostWith(json, status));
    expect(json).toHaveBeenCalled();
    const firstCall = json.mock.calls[0] as [
      { error: { code: string; message: string } },
    ];
    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(firstCall[0].error.code).toBe(ErrorCode.NOT_FOUND);
    expect(firstCall[0].error.message.length).toBeGreaterThan(0);
  });

  it('maps unauthorized to UNAUTHORIZED without leaking internals', () => {
    const json = jest.fn();
    const status = jest.fn();
    filter.catch(
      new UnauthorizedException('secret reason'),
      hostWith(json, status),
    );
    expect(status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(json).toHaveBeenCalledWith({
      error: { code: ErrorCode.UNAUTHORIZED, message: 'Unauthorized' },
    });
  });

  it('maps forbidden to FORBIDDEN', () => {
    const json = jest.fn();
    const status = jest.fn();
    filter.catch(new ForbiddenException(), hostWith(json, status));
    expect(json).toHaveBeenCalledWith({
      error: { code: ErrorCode.FORBIDDEN, message: 'Forbidden' },
    });
  });

  it('maps validation messages to VALIDATION_ERROR with details', () => {
    const json = jest.fn();
    const status = jest.fn();
    filter.catch(
      new BadRequestException({
        message: ['limit must not be greater than 50'],
        error: 'Bad Request',
        statusCode: 400,
      }),
      hostWith(json, status),
    );
    expect(json).toHaveBeenCalledWith({
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed',
        details: ['limit must not be greater than 50'],
      },
    });
  });

  it('maps throttling to THROTTLED', () => {
    const json = jest.fn();
    const status = jest.fn();
    filter.catch(new ThrottlerException(), hostWith(json, status));
    expect(status).toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS);
    expect(json).toHaveBeenCalledWith({
      error: { code: ErrorCode.THROTTLED, message: 'Too many requests' },
    });
  });

  it('hides unknown errors as INTERNAL', () => {
    const json = jest.fn();
    const status = jest.fn();
    filter.catch(new Error('db password leaked'), hostWith(json, status));
    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      error: { code: ErrorCode.INTERNAL, message: 'Internal server error' },
    });
  });
});
