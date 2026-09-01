import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { JwtUser } from '../shared/auth/jwt-user';
import { Role } from '../shared/auth/role.enum';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { Roles } from '../shared/decorators/roles.decorator';
import { SyncBatchDto } from './dto/sync-batch.dto';
import { SYNC_THROTTLE_LIMIT, SYNC_THROTTLE_TTL_MS } from './sync.constants';
import { SyncService, type SyncBatchResult } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post()
  @Roles(Role.NATURAL, Role.JURIDICA)
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: SYNC_THROTTLE_LIMIT,
      ttl: SYNC_THROTTLE_TTL_MS,
    },
  })
  apply(
    @CurrentUser() user: JwtUser,
    @Body() dto: SyncBatchDto,
  ): Promise<SyncBatchResult> {
    return this.sync.apply(user, dto.ops ?? [], dto.since);
  }
}
