import { toJwtUser } from '../../src/shared/auth/jwt-user';
import { Role } from '../../src/shared/auth/role.enum';

describe('toJwtUser', () => {
  it('keeps empresa as JURIDICA entityType', () => {
    expect(
      toJwtUser({
        sub: 'org-1',
        role: Role.JURIDICA,
        entityType: 'empresa',
      }),
    ).toEqual({
      sub: 'org-1',
      role: Role.JURIDICA,
      entityType: 'empresa',
    });
  });

  it('never promotes entityType to a role', () => {
    expect(
      toJwtUser({
        sub: 'user-1',
        role: Role.NATURAL,
        entityType: 'empresa',
      }),
    ).toEqual({ sub: 'user-1', role: Role.NATURAL });
  });
});
