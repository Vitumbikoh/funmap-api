import { Controller, Get, Query } from '@nestjs/common';
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
}

