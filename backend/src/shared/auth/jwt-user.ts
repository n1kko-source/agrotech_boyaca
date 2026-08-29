import { Role } from './role.enum';

export type JwtUser = {
  sub: string;
  role: Role;
};
