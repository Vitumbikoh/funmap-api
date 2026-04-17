import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { Event } from '../events/entities/event.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Post } from '../posts/entities/post.entity';
import { Reel } from '../reels/entities/reel.entity';
import { User } from '../users/entities/user.entity';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';
import { Report } from './entities/report.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Report, Post, Reel, Event, User, Payment])],
  controllers: [ModerationController],
  providers: [ModerationService, RolesGuard],
  exports: [ModerationService],
})
export class ModerationModule {}
