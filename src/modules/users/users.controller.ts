import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
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

  @Patch('me')
  updateMe(
    @CurrentUser() user: JwtUser,
    @Body() payload: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.sub, payload);
  }
}

