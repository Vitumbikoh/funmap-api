import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Comment } from '../../shared/database/entities/comment.entity';
import { Like } from '../../shared/database/entities/like.entity';
import { Share } from '../../shared/database/entities/share.entity';
import { View } from '../../shared/database/entities/view.entity';
import { EventsModule } from '../events/events.module';
import { Event } from '../events/entities/event.entity';
import { Rsvp } from '../events/entities/rsvp.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { Post } from '../posts/entities/post.entity';
import { Reel } from '../reels/entities/reel.entity';
import { User } from '../users/entities/user.entity';
import { EngagementController } from './engagement.controller';
import { EngagementService } from './engagement.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Like, Comment, Share, Post, Reel, Event, Rsvp, User]),
    TypeOrmModule.forFeature([View]),
    NotificationsModule,
    EventsModule,
  ],
  controllers: [EngagementController],
  providers: [EngagementService],
  exports: [EngagementService],
})
export class EngagementModule {}
