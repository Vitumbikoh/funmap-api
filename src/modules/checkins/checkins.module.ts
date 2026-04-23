import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CheckinsController } from './checkins.controller';
import { CheckinsService } from './checkins.service';
import { Checkin } from './entities/checkin.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Checkin])],
  controllers: [CheckinsController],
  providers: [CheckinsService],
})
export class CheckinsModule {}
