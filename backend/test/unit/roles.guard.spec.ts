import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../src/shared/auth/role.enum';
import { RolesGuard } from '../../src/shared/guards/roles.guard';
import { JwtUser } from '../../src/shared/auth/jwt-user';

describe('RolesGuard', () => {
  const getAllAndOverride = jest.fn();
  const reflector = { getAllAndOverride } as unknown as Reflector;
  const guard = new RolesGuard(reflector);

  function context(user?: JwtUser): ExecutionContext {
    return {
      getHandler: () => Function,
      getClass: () => Function,
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    getAllAndOverride.mockReset();
  });

  it('allows when no roles are required', () => {
    getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(context())).toBe(true);
  });

  it('allows when the user has a required role', () => {
    getAllAndOverride.mockReturnValue([Role.NATURAL]);
    expect(guard.canActivate(context({ sub: '1', role: Role.NATURAL }))).toBe(
      true,
    );
  });

  it('forbids when the user role does not match', () => {
    getAllAndOverride.mockReturnValue([Role.JURIDICA]);
    expect(() =>
      guard.canActivate(context({ sub: '1', role: Role.NATURAL })),
    ).toThrow(ForbiddenException);
  });

  it('forbids when there is no user', () => {
    getAllAndOverride.mockReturnValue([Role.NATURAL]);
    expect(() => guard.canActivate(context())).toThrow(ForbiddenException);
  });
});
