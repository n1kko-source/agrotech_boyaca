import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { toJwtUser, type JwtUser } from '../auth/jwt-user';
import { Role } from '../auth/role.enum';
import { pemFromEnv } from '../config/pem';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthenticatedRequest } from '../types/authenticated-request';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Unauthorized');
    }

    const publicKey = pemFromEnv(this.config.get<string>('JWT_PUBLIC_KEY'));
    if (!publicKey) {
      throw new UnauthorizedException('Unauthorized');
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtUser>(token, {
        algorithms: ['RS256'],
        publicKey,
      });
      if (!payload.sub || !isRole(payload.role)) {
        throw new UnauthorizedException('Unauthorized');
      }
      request.user = toJwtUser(payload);
      return true;
    } catch {
      throw new UnauthorizedException('Unauthorized');
    }
  }
}

function extractBearerToken(header: string | undefined): string | undefined {
  if (!header?.startsWith('Bearer ')) {
    return undefined;
  }
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : undefined;
}

function isRole(value: unknown): value is Role {
  return (
    value === Role.NATURAL || value === Role.JURIDICA || value === Role.ADMIN
  );
}
