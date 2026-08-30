import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import type { JwtUser } from '../shared/auth/jwt-user';
import { Role } from '../shared/auth/role.enum';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { Roles } from '../shared/decorators/roles.decorator';
import { SearchQueryDto } from './dto/search-query.dto';
import { UpsertProfileDto } from './dto/upsert-profile.dto';
import { ProfilesService } from './profiles.service';

@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get('search')
  search(@Query() query: SearchQueryDto) {
    return this.profiles.search(query.q, query.limit);
  }

  @Put('me')
  @Roles(Role.NATURAL, Role.JURIDICA)
  upsert(@CurrentUser() user: JwtUser, @Body() dto: UpsertProfileDto) {
    return this.profiles.upsert(user.sub, {
      displayName: dto.displayName,
      municipality: dto.municipality,
      category: dto.category,
      bio: dto.bio,
    });
  }
}
