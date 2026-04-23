import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Event } from '../events/entities/event.entity';
import { Post } from '../posts/entities/post.entity';
import { Reel } from '../reels/entities/reel.entity';
import { User } from '../users/entities/user.entity';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Post, Reel, Event])],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}