import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import type { JwtUser } from '../shared/auth/jwt-user';
import { Role } from '../shared/auth/role.enum';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { Roles } from '../shared/decorators/roles.decorator';
import { CursorPaginationQueryDto } from '../shared/dto/cursor-pagination-query.dto';
import { AdminJuridicaService } from './admin-juridica.service';
import { VerifyJuridicaDto } from './dto/verify-juridica.dto';

@Controller('admin/juridica')
@Roles(Role.ADMIN)
export class AdminJuridicaController {
  constructor(private readonly admin: AdminJuridicaService) {}

  @Get('pending')
  listPending(@Query() query: CursorPaginationQueryDto) {
    return this.admin.listPending(query.limit, query.cursor);
  }

  @Patch(':id/verify')
  @HttpCode(HttpStatus.OK)
  setVerified(
    @CurrentUser() actor: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyJuridicaDto,
  ) {
    return this.admin.setVerified(actor.sub, id, dto.verified);
  }
}
