import { Body, Controller, Get, Post as HttpPost, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { GeoQueryDto } from '../../shared/dto/geo-query.dto';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { CreateStatusDto } from './dto/create-status.dto';
import { PostsService } from './posts.service';

@Controller('statuses')
export class StatusesController {
  constructor(private readonly postsService: PostsService) {}

  @Get('nearby')
  @UseGuards(JwtAuthGuard)
  findNearby(@CurrentUser() user: JwtUser, @Query() query: GeoQueryDto) {
    return this.postsService.findNearbyStatuses(user, query);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  findMine(@CurrentUser() user: JwtUser) {
    return this.postsService.findMyStatuses(user);
  }

  @HttpPost()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: JwtUser, @Body() payload: CreateStatusDto) {
    return this.postsService.createStatus(user, payload);
  }
}