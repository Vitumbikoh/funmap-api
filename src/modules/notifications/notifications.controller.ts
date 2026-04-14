import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../shared/dto/pagination-query.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { MarkNotificationsReadDto } from './dto/mark-notifications-read.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UnregisterDeviceDto } from './dto/unregister-device.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: JwtUser, @Query() query: PaginationQueryDto) {
    return this.notificationsService.listForUser(user, query);
  }

  @Get('activity-summary')
  activitySummary(
    @CurrentUser() user: JwtUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.notificationsService.listActivitySummary(user, query);
  }

  @Patch('read')
  markRead(
    @CurrentUser() user: JwtUser,
    @Body() payload: MarkNotificationsReadDto,
  ) {
    return this.notificationsService.markAsRead(user, payload);
  }

  @Patch('devices/register')
  registerDevice(
    @CurrentUser() user: JwtUser,
    @Body() payload: RegisterDeviceDto,
  ) {
    return this.notificationsService.registerDevice(user, payload);
  }

  @Patch('devices/unregister')
  unregisterDevice(
    @CurrentUser() user: JwtUser,
    @Body() payload: UnregisterDeviceDto,
  ) {
    return this.notificationsService.unregisterDevice(user, payload);
  }
}

