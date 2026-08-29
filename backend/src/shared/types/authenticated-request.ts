import type { Request } from 'express';
import { JwtUser } from '../auth/jwt-user';

export type AuthenticatedRequest = Request & { user?: JwtUser };
