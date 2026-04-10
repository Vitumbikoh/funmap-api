import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigService } from '../../shared/config/app-config.service';
import { FcmService } from '../../shared/services/fcm.service';
import { NotificationDevice } from './entities/notification-device.entity';
import { Notification } from './entities/notification.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, NotificationDevice])],
  controllers: [NotificationsController],
  providers: [AppConfigService, FcmService, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}

