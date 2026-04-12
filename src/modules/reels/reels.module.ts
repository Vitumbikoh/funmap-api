import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reel } from './entities/reel.entity';
import { ReelsController } from './reels.controller';
import { ReelsService } from './reels.service';

@Module({
  imports: [TypeOrmModule.forFeature([Reel])],
  controllers: [ReelsController],
  providers: [ReelsService],
  exports: [ReelsService, TypeOrmModule],
})
export class ReelsModule {}
