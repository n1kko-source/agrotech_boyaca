import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import type { JwtUser } from '../shared/auth/jwt-user';
import { Role } from '../shared/auth/role.enum';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { Roles } from '../shared/decorators/roles.decorator';
import { CommoditiesService } from './commodities.service';
import { QueryPriceDto } from './dto/query-price.dto';
import { UpsertPriceDto } from './dto/upsert-price.dto';

@Controller('commodities')
export class CommoditiesController {
  constructor(private readonly commodities: CommoditiesService) {}

  @Post('precios')
  @Roles(Role.JURIDICA)
  @HttpCode(HttpStatus.OK)
  upsert(@CurrentUser() user: JwtUser, @Body() dto: UpsertPriceDto) {
    return this.commodities.upsert(user.sub, {
      producto: dto.producto,
      region: dto.region,
      precio: dto.precio,
      unidad: dto.unidad,
    });
  }

  @Get('precios')
  get(@Query() query: QueryPriceDto) {
    return this.commodities.get(query.producto, query.region);
  }
}
