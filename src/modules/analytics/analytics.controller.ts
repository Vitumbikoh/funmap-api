import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import { Role } from '../../shared/enums/role.enum';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { CreatorAnalyticsQueryDto } from './dto/creator-analytics-query.dto';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('me')
  getMyAnalytics(
    @CurrentUser() user: JwtUser,
    @Query() query: CreatorAnalyticsQueryDto,
  ) {
    return this.analyticsService.getCreatorAnalytics(user.sub, query.range);
  }

  @Get('users/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.CAPITAL_USER)
  getUserAnalytics(
    @Param('id', new ParseUUIDPipe()) userId: string,
    @Query() query: CreatorAnalyticsQueryDto,
  ) {
    return this.analyticsService.getCreatorAnalytics(userId, query.range);
  }
}
