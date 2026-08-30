import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import type { JwtUser } from '../shared/auth/jwt-user';
import { Role } from '../shared/auth/role.enum';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { Roles } from '../shared/decorators/roles.decorator';
import { ClimaService, type AlertView } from './clima.service';
import { CreateAlertaDto } from './dto/create-alerta.dto';

@Controller('alertas')
export class AlertasController {
  constructor(private readonly clima: ClimaService) {}

  @Post()
  @Roles(Role.NATURAL, Role.JURIDICA)
  @HttpCode(HttpStatus.OK)
  upsert(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateAlertaDto,
  ): Promise<AlertView> {
    return this.clima.upsertAlert(user.sub, {
      municipio: dto.municipio,
      kind: dto.kind,
      enabled: dto.enabled,
    });
  }

  @Get()
  @Roles(Role.NATURAL, Role.JURIDICA)
  list(@CurrentUser() user: JwtUser): Promise<{ items: AlertView[] }> {
    return this.clima.listAlerts(user.sub);
  }
}
