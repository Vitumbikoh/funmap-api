import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { GeoQueryDto } from '../../shared/dto/geo-query.dto';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: JwtUser) {
    return this.usersService.findById(user.sub);
  }

  @Get('nearby')
  getNearbyUsers(@CurrentUser() user: JwtUser, query: GeoQueryDto) {
    return this.usersService.findNearbyUsers(user.sub, query);
  }

  @Get('me/saved')
  getMySaved(@CurrentUser() user: JwtUser) {
    return this.usersService.getSavedItems(user.sub);
  }

  @Get('me/bookings')
  getMyBookings(@CurrentUser() user: JwtUser) {
    return this.usersService.getBookings(user.sub);
  }

  @Get('me/history')
  getMyHistory(@CurrentUser() user: JwtUser) {
    return this.usersService.getHistory(user.sub);
  }

  @Get('me/wallet')
  getMyWallet(@CurrentUser() user: JwtUser) {
    return this.usersService.getWalletSummary(user.sub);
  }

  @Patch('me')
  updateMe(
    @CurrentUser() user: JwtUser,
    @Body() payload: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.sub, payload);
  }

  @Post('me/upgrade-business')
  upgradeMeToBusiness(@CurrentUser() user: JwtUser) {
    return this.usersService.upgradeToBusiness(user.sub);
  }
}

