import { Role } from './role.enum';

/** JURIDICA profile discriminator. Never a Role. */
export type JwtEntityType = 'asociacion' | 'cooperativa' | 'empresa';

export type JwtUser = {
  sub: string;
  role: Role;
  entityType?: JwtEntityType;
};

export function isJwtEntityType(value: unknown): value is JwtEntityType {
  return (
    value === 'asociacion' || value === 'cooperativa' || value === 'empresa'
  );
}

export function toJwtUser(payload: {
  sub: string;
  role: Role;
  entityType?: unknown;
}): JwtUser {
  const user: JwtUser = { sub: payload.sub, role: payload.role };
  if (payload.role === Role.JURIDICA && isJwtEntityType(payload.entityType)) {
    user.entityType = payload.entityType;
  }
  return user;
}
