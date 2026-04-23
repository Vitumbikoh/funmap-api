import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchService } from './search.service';

@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  discover(@CurrentUser() user: JwtUser, @Query() query: SearchQueryDto) {
    return this.searchService.discover(user.sub, query);
  }
}
