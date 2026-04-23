import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Comment } from '../../shared/database/entities/comment.entity';
import { Like } from '../../shared/database/entities/like.entity';
import { Share } from '../../shared/database/entities/share.entity';
import { View } from '../../shared/database/entities/view.entity';
import { Event } from '../events/entities/event.entity';
import { Follow } from '../follows/entities/follow.entity';
import { Post } from '../posts/entities/post.entity';
import { Reel } from '../reels/entities/reel.entity';
import { User } from '../users/entities/user.entity';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Post, Reel, Event, Follow, Like, Comment, Share, View]),
    TypeOrmModule.forFeature([User]),
  ],
  controllers: [FeedController],
  providers: [FeedService],
})
export class FeedModule {}
