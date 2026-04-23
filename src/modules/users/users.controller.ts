import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../shared/decorators/roles.decorator';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { GeoQueryDto } from '../../shared/dto/geo-query.dto';
import { Role } from '../../shared/enums/role.enum';
import { JwtUser } from '../../shared/interfaces/jwt-user.interface';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { DeactivateAccountDto } from './dto/deactivate-account.dto';
import { UpdateFunOclockDto } from './dto/update-fun-oclock.dto';
import { UpdateNationalIdStatusDto } from './dto/update-national-id-status.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AdminListUsersQueryDto } from './dto/admin-list-users-query.dto';
import { AdminUpdateAccountStatusDto } from './dto/admin-update-account-status.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: JwtUser) {
    return this.usersService.getPublicProfile(user.sub);
  }

  @Get('nearby')
  getNearbyUsers(@CurrentUser() user: JwtUser, @Query() query: GeoQueryDto) {
    return this.usersService.findNearbyUsers(user.sub, query);
  }

  @Get('places/nearby')
  getNearbyPlaces(@CurrentUser() user: JwtUser, @Query() query: GeoQueryDto) {
    return this.usersService.findNearbyPlaces(user.sub, query);
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

  @Post('me/deactivate')
  deactivateMe(
    @CurrentUser() user: JwtUser,
    @Body() payload: DeactivateAccountDto,
  ) {
    return this.usersService.deactivateAccount(user.sub, payload.reactivateAt);
  }

  @Delete('me/account')
  deleteMePermanently(@CurrentUser() user: JwtUser) {
    return this.usersService.deleteAccountPermanently(user.sub);
  }

  @Get('me/fun-oclock')
  getMyFunOclock(@CurrentUser() user: JwtUser) {
    return this.usersService.getFunOclockPreferences(user.sub);
  }

  @Get(':id/profile-preview')
  getProfilePreview(
    @CurrentUser() user: JwtUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.usersService.getProfilePreview(user.sub, id);
  }

  @Patch('me/fun-oclock')
  updateMyFunOclock(
    @CurrentUser() user: JwtUser,
    @Body() payload: UpdateFunOclockDto,
  ) {
    return this.usersService.updateFunOclockPreferences(user.sub, payload);
  }

  @Get('admin/national-id/pending')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  getPendingNationalIdReviews() {
    return this.usersService.getPendingNationalIdReviews();
  }

  @Patch('admin/national-id/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  updateNationalIdReviewStatus(
    @CurrentUser() user: JwtUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: UpdateNationalIdStatusDto,
  ) {
    return this.usersService.updateNationalIdReviewStatus(user.sub, id, payload);
  }

  @Get('admin/users')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  listUsersForAdmin(@Query() query: AdminListUsersQueryDto) {
    return this.usersService.listUsersForAdmin(query);
  }

  @Patch('admin/users/:id/status')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  updateUserAccountStatus(
    @CurrentUser() user: JwtUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() payload: AdminUpdateAccountStatusDto,
  ) {
    return this.usersService.updateUserAccountStatusForAdmin(
      user.sub,
      id,
      payload,
    );
  }
}
