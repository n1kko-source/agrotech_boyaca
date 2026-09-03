import { Controller, Get } from '@nestjs/common';
import type { JwtUser } from '../shared/auth/jwt-user';
import { Role } from '../shared/auth/role.enum';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { Roles } from '../shared/decorators/roles.decorator';
import {
  SuscripcionesService,
  type SubscriptionView,
} from './suscripciones.service';

@Controller('suscripciones')
@Roles(Role.NATURAL, Role.JURIDICA)
export class SuscripcionesController {
  constructor(private readonly suscripciones: SuscripcionesService) {}

  @Get('me')
  me(@CurrentUser() user: JwtUser): Promise<SubscriptionView> {
    return this.suscripciones.me(user.sub);
  }
}
