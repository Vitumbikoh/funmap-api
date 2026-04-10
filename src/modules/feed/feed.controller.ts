import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { FeedService } from './feed.service';
import { FeedQueryDto } from './dto/feed-query.dto';

@Controller('feed')
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Get('nearby')
  getNearby(@Query() query: FeedQueryDto) {
    return this.feedService.getNearbyFeed(query);
  }

  @Get('trending')
  getTrendingSummary() {
    return this.feedService.getTrendingSummary();
  }

  @Get('following')
  @UseGuards(JwtAuthGuard)
  getFollowing(@CurrentUser() user: JwtUser, @Query() query: FeedQueryDto) {
    return this.feedService.getFollowingFeed(user.sub, query);
  }
}

