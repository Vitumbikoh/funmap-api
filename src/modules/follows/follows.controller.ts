import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { FollowsService } from './follows.service';

@Controller('follows')
@UseGuards(JwtAuthGuard)
export class FollowsController {
  constructor(private readonly followsService: FollowsService) {}

  @Post(':userId')
  follow(
    @CurrentUser() user: JwtUser,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.followsService.follow(user, userId);
  }

  @Delete(':userId')
  unfollow(
    @CurrentUser() user: JwtUser,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.followsService.unfollow(user, userId);
  }

  @Get('me/following')
  listMyFollowing(@CurrentUser() user: JwtUser) {
    return this.followsService.listFollowing(user);
  }

  @Get('users/:userId/followers')
  listFollowers(@Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.followsService.listFollowers(userId);
  }
}