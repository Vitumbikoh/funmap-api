import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { Reel } from './entities/reel.entity';
import { ReelsController } from './reels.controller';
import { ReelsService } from './reels.service';

@Module({
  imports: [TypeOrmModule.forFeature([Reel, User])],
  controllers: [ReelsController],
  providers: [ReelsService],
  exports: [ReelsService, TypeOrmModule],
})
export class ReelsModule {}
