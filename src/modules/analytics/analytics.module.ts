import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { Event } from '../events/entities/event.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Post } from '../posts/entities/post.entity';
import { Reel } from '../reels/entities/reel.entity';
import { User } from '../users/entities/user.entity';
import { UsersModule } from '../users/users.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [TypeOrmModule.forFeature([Post, Reel, Event, Payment, User]), UsersModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, RolesGuard],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
