import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { GeoQueryDto } from '../../shared/dto/geo-query.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { CreateReelDto } from './dto/create-reel.dto';
import { ReelsService } from './reels.service';

@Controller('reels')
export class ReelsController {
  constructor(private readonly reelsService: ReelsService) {}

  @Get('nearby')
  findNearby(@Query() query: GeoQueryDto) {
    return this.reelsService.findNearby(query);
  }

  @Get('trending')
  findTrending(@Query() query: GeoQueryDto) {
    return this.reelsService.findTrending(query);
  }

  @Get('for-you')
  @UseGuards(JwtAuthGuard)
  findForYou(@CurrentUser() user: JwtUser, @Query() query: GeoQueryDto) {
    return this.reelsService.findForYou(user, query);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  findMine(@CurrentUser() user: JwtUser) {
    return this.reelsService.findMine(user);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: JwtUser, @Body() payload: CreateReelDto) {
    return this.reelsService.create(user, payload);
  }
}

