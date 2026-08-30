import { generateKeyPairSync } from 'node:crypto';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../../src/shared/auth/role.enum';
import { JwtAuthGuard } from '../../src/shared/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../../src/shared/types/authenticated-request';

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

describe('JwtAuthGuard', () => {
  const jwt = new JwtService();
  const getAllAndOverride = jest.fn();
  const reflector = { getAllAndOverride } as unknown as Reflector;
  const config = {
    get: (key: string) => (key === 'JWT_PUBLIC_KEY' ? publicKey : undefined),
  } as ConfigService;
  const guard = new JwtAuthGuard(jwt, reflector, config);

  function httpContext(authorization?: string): {
    ctx: ExecutionContext;
    request: AuthenticatedRequest;
  } {
    const request = {
      headers: { authorization },
    } as AuthenticatedRequest;
    const ctx = {
      getHandler: () => Function,
      getClass: () => Function,
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
    return { ctx, request };
  }

  beforeEach(() => {
    getAllAndOverride.mockReturnValue(false);
  });

  it('attaches JURIDICA entityType on the request, not as a role', async () => {
    const accessToken = await jwt.signAsync(
      { sub: 'org-1', role: Role.JURIDICA, entityType: 'empresa' },
      { algorithm: 'RS256', privateKey, expiresIn: 60 },
    );
    const { ctx, request } = httpContext(`Bearer ${accessToken}`);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toEqual({
      sub: 'org-1',
      role: Role.JURIDICA,
      entityType: 'empresa',
    });
  });

  it('does not attach entityType for NATURAL', async () => {
    const accessToken = await jwt.signAsync(
      { sub: 'user-1', role: Role.NATURAL, entityType: 'empresa' },
      { algorithm: 'RS256', privateKey, expiresIn: 60 },
    );
    const { ctx, request } = httpContext(`Bearer ${accessToken}`);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toEqual({ sub: 'user-1', role: Role.NATURAL });
  });

  it('rejects empresa as a JWT role', async () => {
    const accessToken = await jwt.signAsync(
      { sub: 'org-1', role: 'empresa' },
      { algorithm: 'RS256', privateKey, expiresIn: 60 },
    );
    const { ctx } = httpContext(`Bearer ${accessToken}`);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
