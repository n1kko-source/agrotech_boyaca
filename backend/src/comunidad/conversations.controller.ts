import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { JwtUser } from '../shared/auth/jwt-user';
import { Role } from '../shared/auth/role.enum';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { Roles } from '../shared/decorators/roles.decorator';
import { CursorPaginationQueryDto } from '../shared/dto/cursor-pagination-query.dto';
import type { Paginated } from '../shared/pagination/cursor';
import {
  ConversationsService,
  type ConversationView,
  type MessageView,
} from './conversations.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import {
  MESSAGE_SEND_THROTTLE_LIMIT,
  MESSAGE_SEND_THROTTLE_TTL_MS,
} from './messaging.constants';

@Controller('conversaciones')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Post()
  @Roles(Role.NATURAL, Role.JURIDICA)
  async start(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateConversationDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ConversationView> {
    const result = await this.conversations.start(user.sub, dto.postId);
    res.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result.conversation;
  }

  @Post(':id/mensajes')
  @Roles(Role.NATURAL, Role.JURIDICA)
  @HttpCode(HttpStatus.CREATED)
  @Throttle({
    default: {
      limit: MESSAGE_SEND_THROTTLE_LIMIT,
      ttl: MESSAGE_SEND_THROTTLE_TTL_MS,
    },
  })
  sendMessage(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateMessageDto,
  ): Promise<MessageView> {
    return this.conversations.sendMessage(user.sub, id, dto.body);
  }

  @Get(':id/mensajes')
  @Roles(Role.NATURAL, Role.JURIDICA)
  listMessages(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CursorPaginationQueryDto,
  ): Promise<Paginated<MessageView>> {
    return this.conversations.listMessages(
      user.sub,
      id,
      query.limit,
      query.cursor,
    );
  }
}
