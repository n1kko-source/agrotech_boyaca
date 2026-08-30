import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type { JwtUser } from '../shared/auth/jwt-user';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { AckNotificationsDto } from './dto/ack-notifications.dto';
import { PendingQueryDto } from './dto/pending-query.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UnregisterDeviceDto } from './dto/unregister-device.dto';
import { NotificationService, type PendingItem } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationService) {}

  @Put('devices')
  @HttpCode(HttpStatus.OK)
  register(
    @CurrentUser() user: JwtUser,
    @Body() dto: RegisterDeviceDto,
  ): Promise<{ registered: true }> {
    return this.notifications.registerDevice(user.sub, {
      token: dto.fcmToken,
      deviceId: dto.deviceId,
    });
  }

  @Delete('devices')
  @HttpCode(HttpStatus.OK)
  unregister(
    @CurrentUser() user: JwtUser,
    @Body() dto: UnregisterDeviceDto,
  ): Promise<{ revoked: true }> {
    return this.notifications.unregisterDevice(user.sub, dto.deviceId);
  }

  @Get('pending')
  pending(
    @CurrentUser() user: JwtUser,
    @Query() query: PendingQueryDto,
  ): Promise<{ items: PendingItem[] }> {
    return this.notifications.pending(user.sub, query.limit);
  }

  @Post('pending/ack')
  @HttpCode(HttpStatus.OK)
  ack(
    @CurrentUser() user: JwtUser,
    @Body() dto: AckNotificationsDto,
  ): Promise<{ acked: number }> {
    return this.notifications.ack(user.sub, dto.ids);
  }
}
