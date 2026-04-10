import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { Event } from '../events/entities/event.entity';
import { Post } from '../posts/entities/post.entity';
import { Reel } from '../reels/entities/reel.entity';
import { Promotion } from './entities/promotion.entity';
import { PromotionsController } from './promotions.controller';
import { PromotionsService } from './promotions.service';

@Module({
  imports: [TypeOrmModule.forFeature([Promotion, Post, Event, Reel])],
  controllers: [PromotionsController],
  providers: [PromotionsService, RolesGuard],
  exports: [PromotionsService],
})
export class PromotionsModule {}