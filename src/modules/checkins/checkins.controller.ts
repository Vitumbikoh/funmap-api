import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { GeoQueryDto } from '../../shared/dto/geo-query.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { CreateCheckinDto } from './dto/create-checkin.dto';
import { CheckinsService } from './checkins.service';

@Controller('checkins')
export class CheckinsController {
  constructor(private readonly checkinsService: CheckinsService) {}

  @Get('nearby')
  findNearby(@Query() query: GeoQueryDto) {
    return this.checkinsService.findNearby(query);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: JwtUser, @Body() payload: CreateCheckinDto) {
    return this.checkinsService.create(user, payload);
  }
}

