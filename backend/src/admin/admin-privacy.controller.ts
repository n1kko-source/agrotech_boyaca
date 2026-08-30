import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '../shared/auth/role.enum';
import { Roles } from '../shared/decorators/roles.decorator';
import { CursorPaginationQueryDto } from '../shared/dto/cursor-pagination-query.dto';
import { AdminPrivacyService } from './admin-privacy.service';

@Controller('admin/privacy')
@Roles(Role.ADMIN)
export class AdminPrivacyController {
  constructor(private readonly privacy: AdminPrivacyService) {}

  @Get('deletion-requests')
  listDeletionRequests(@Query() query: CursorPaginationQueryDto) {
    return this.privacy.listDeletionRequests(query.limit, query.cursor);
  }
}
