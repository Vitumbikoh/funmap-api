import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Event } from '../events/entities/event.entity';
import { Rsvp } from '../events/entities/rsvp.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Like } from '../../shared/database/entities/like.entity';
import { Post } from '../posts/entities/post.entity';
import { Reel } from '../reels/entities/reel.entity';
import { User } from './entities/user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Event, Rsvp, Payment, Like, Post, Reel]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService, TypeOrmModule],
})
export class UsersModule {}

