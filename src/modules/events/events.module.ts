import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { Media } from '../media/entities/media.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { User } from '../users/entities/user.entity';
import { Event } from './entities/event.entity';
import { Rsvp } from './entities/rsvp.entity';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Event, Rsvp, User, Media]),
    NotificationsModule,
  ],
  controllers: [EventsController],
  providers: [EventsService, RolesGuard],
  exports: [EventsService, TypeOrmModule],
})
export class EventsModule {}
