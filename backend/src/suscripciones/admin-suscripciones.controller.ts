import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import type { JwtUser } from '../shared/auth/jwt-user';
import { Role } from '../shared/auth/role.enum';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { Roles } from '../shared/decorators/roles.decorator';
import { RecordPaymentDto } from './dto/record-payment.dto';
import {
  SuscripcionesService,
  type SubscriptionView,
} from './suscripciones.service';

@Controller('admin/suscripciones')
@Roles(Role.ADMIN)
export class AdminSuscripcionesController {
  constructor(private readonly suscripciones: SuscripcionesService) {}

  @Post(':userId/pagos')
  @HttpCode(HttpStatus.OK)
  recordPayment(
    @CurrentUser() actor: JwtUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: RecordPaymentDto,
  ): Promise<SubscriptionView> {
    return this.suscripciones.recordPayment(actor.sub, userId, {
      channel: dto.channel,
      reference: dto.reference,
    });
  }
}
